import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT } from "@/lib/archive";

export type AuditFileRef = { source: string; id: string; label: string };

export type AuditResult = {
  orphanFiles: string[];
  brokenLinks: { filePath: string; refs: AuditFileRef[] }[];
  duplicateFilePaths: { filePath: string; refs: AuditFileRef[] }[];
  nearDuplicates: { table: string; amount: number; date: string; rows: AuditFileRef[] }[];
  soldWithoutPurchasePrice: { vin: string; make: string; model: string; salePrice: number | null }[];
  soldWithoutSoldAt: { vin: string; make: string; model: string }[];
  notSoldWithSoldAt: { vin: string; make: string; model: string; status: string; soldAt: string }[];
  vatCaptureByQuarter: {
    quarter: string;
    generalExpense: { total: number; withVat: number; gross: number };
    expense: { total: number; withVat: number; gross: number };
  }[];
};

function walk(dir: string): string[] {
  let out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

function toRelative(fullPath: string): string {
  return path.relative(ARCHIVE_ROOT, fullPath).replace(/\\/g, "/");
}

function quarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()} Q${q}`;
}

/**
 * Полная сверка базы с архивом на диске — "агент-проверка" перед отправкой чего-либо
 * бухгалтеру. Только чтение, ничего не меняет. См. app/audit/page.tsx.
 */
export async function runAudit(): Promise<AuditResult> {
  const [docs, gexp, services, cars, expenses] = await Promise.all([
    prisma.document.findMany({ include: { car: { select: { make: true, model: true, vin: true, status: true } } } }),
    prisma.generalExpense.findMany(),
    prisma.service.findMany(),
    prisma.car.findMany(),
    prisma.expense.findMany({ include: { car: { select: { make: true, model: true, vin: true } } } }),
  ]);

  // --- Собираем все ссылки на файлы архива из базы (с суммой — чтобы отличить
  // "один скан на несколько позиций" от настоящего повторного занесения той же суммы) ---
  type PathRef = AuditFileRef & { amountCents: number };
  const dbPaths = new Map<string, PathRef[]>();
  function addRef(filePath: string | null, ref: PathRef) {
    if (!filePath) return;
    const norm = filePath.replace(/\\/g, "/");
    if (!dbPaths.has(norm)) dbPaths.set(norm, []);
    dbPaths.get(norm)!.push(ref);
  }
  for (const d of docs) {
    addRef(d.filePath, { source: "Document", id: d.id, label: `${d.car.make} ${d.car.model} (${d.car.vin}) — ${d.kind}`, amountCents: 0 });
  }
  for (const g of gexp) {
    addRef(g.filePath, { source: "GeneralExpense", id: g.id, label: `${g.title} — ${(g.amountCents / 100).toFixed(2)}€`, amountCents: g.amountCents });
  }
  for (const s of services) {
    addRef(s.filePath, { source: "Service", id: s.id, label: `${s.title} — ${(s.amountCents / 100).toFixed(2)}€`, amountCents: s.amountCents });
  }

  // Expense (расходы по машинам) не имеют отдельного поля filePath — путь к файлу упоминается
  // только текстом в note, см. convention в app/api/check-mail и check-telegram. На практике
  // встречаются два префикса ("Файл: ..." и "Скан: ..." — второй из импорта 2024 Q4 andere
  // Ausgaben, 24 записи) — раньше распознавался только "Файл:", из-за чего /audit ошибочно
  // считал ~24 реально учтённых файла "необработанными" (см. lib/audit.ts аудит сессии).
  // Индексируем оба варианта, чтобы не считать такие файлы "не обработанными".
  const notePaths = new Set<string>();
  for (const e of expenses) {
    if (!e.note) continue;
    const m = e.note.match(/(?:Файл|Скан):\s*(.+?\.(?:pdf|jpe?g|png))\.?(?:\s|$)/i);
    if (m) notePaths.add(m[1].trim().replace(/\\/g, "/"));
  }

  // --- Все файлы физически в архиве ---
  const allFiles = walk(ARCHIVE_ROOT).map(toRelative);

  // Банковские выписки (.CSV) и подобное — не отдельные счета, не флагуем как "не обработано".
  const NON_INVOICE_RE = /\.(csv)$/i;
  const orphanFiles = allFiles
    .filter((f) => !dbPaths.has(f) && !notePaths.has(f) && !NON_INVOICE_RE.test(f))
    .sort();

  const brokenLinks: AuditResult["brokenLinks"] = [];
  const duplicateFilePaths: AuditResult["duplicateFilePaths"] = [];
  for (const [filePath, refs] of dbPaths) {
    const full = path.join(ARCHIVE_ROOT, filePath.replace(/\//g, "\\"));
    if (!fs.existsSync(full)) brokenLinks.push({ filePath, refs });
    // Настоящий дубль — когда файл привязан НЕСКОЛЬКО РАЗ с одной и той же суммой
    // (одна и та же позиция занесена дважды). Один скан с разными позициями/суммами
    // (Sammelscan за месяц) — это нормально, не флагуем.
    const byAmount = new Map<number, PathRef[]>();
    for (const r of refs) {
      if (!byAmount.has(r.amountCents)) byAmount.set(r.amountCents, []);
      byAmount.get(r.amountCents)!.push(r);
    }
    for (const group of byAmount.values()) {
      if (group.length > 1) duplicateFilePaths.push({ filePath, refs: group });
    }
  }
  brokenLinks.sort((a, b) => a.filePath.localeCompare(b.filePath));
  duplicateFilePaths.sort((a, b) => a.filePath.localeCompare(b.filePath));

  // --- Похожие записи (та же сумма и дата) — низкая уверенность, на ручную проверку ---
  const nearDuplicates: AuditResult["nearDuplicates"] = [];
  function scanNear(
    table: string,
    rows: { id: string; amountCents: number; date: Date | null; title?: string; label: string }[]
  ) {
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.date) continue;
      const key = `${r.amountCents}|${r.date.toISOString().slice(0, 10)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const [amountCents, date] = key.split("|");
      nearDuplicates.push({
        table,
        amount: Number(amountCents) / 100,
        date,
        rows: group.map((r) => ({ source: table, id: r.id, label: r.label })),
      });
    }
  }
  scanNear(
    "GeneralExpense",
    gexp.map((g) => ({ id: g.id, amountCents: g.amountCents, date: g.date, label: g.title }))
  );
  scanNear(
    "Service",
    services.map((s) => ({ id: s.id, amountCents: s.amountCents, date: s.date, label: s.title }))
  );
  scanNear(
    "Expense",
    expenses.map((e) => ({
      id: e.id,
      amountCents: e.amountCents,
      date: e.date,
      label: `${e.car.make} ${e.car.model} — ${e.title}`,
    }))
  );

  // --- Проверки по машинам ---
  const soldWithoutPurchasePrice = cars
    .filter((c) => c.status === "SOLD" && c.purchasePriceCents === null)
    .map((c) => ({ vin: c.vin, make: c.make, model: c.model, salePrice: c.salePriceCents !== null ? c.salePriceCents / 100 : null }));

  const soldWithoutSoldAt = cars
    .filter((c) => c.status === "SOLD" && c.soldAt === null)
    .map((c) => ({ vin: c.vin, make: c.make, model: c.model }));

  const notSoldWithSoldAt = cars
    .filter((c) => c.status !== "SOLD" && c.soldAt !== null)
    .map((c) => ({ vin: c.vin, make: c.make, model: c.model, status: c.status, soldAt: c.soldAt!.toISOString().slice(0, 10) }));

  // --- Покрытие НДС по кварталам (последние 6) ---
  const quarterMap = new Map<string, { generalExpense: { total: number; withVat: number; gross: number }; expense: { total: number; withVat: number; gross: number } }>();
  function bump(map: typeof quarterMap, q: string, table: "generalExpense" | "expense", amountCents: number, hasVat: boolean) {
    if (!map.has(q)) map.set(q, { generalExpense: { total: 0, withVat: 0, gross: 0 }, expense: { total: 0, withVat: 0, gross: 0 } });
    const entry = map.get(q)![table];
    entry.total++;
    entry.gross += amountCents / 100;
    if (hasVat) entry.withVat++;
  }
  for (const g of gexp) {
    if (!g.date) continue;
    bump(quarterMap, quarterLabel(g.date), "generalExpense", g.amountCents, g.vatAmountCents !== null);
  }
  for (const e of expenses) {
    if (!e.date) continue;
    bump(quarterMap, quarterLabel(e.date), "expense", e.amountCents, e.vatAmountCents !== null);
  }
  const vatCaptureByQuarter = [...quarterMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([quarter, v]) => ({ quarter, ...v }));

  return {
    orphanFiles,
    brokenLinks,
    duplicateFilePaths,
    nearDuplicates,
    soldWithoutPurchasePrice,
    soldWithoutSoldAt,
    notSoldWithSoldAt,
    vatCaptureByQuarter,
  };
}
