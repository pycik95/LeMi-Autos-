import path from "path";
import { prisma } from "@/lib/prisma";
import { clearButtons, editCaption, sendDocument, type Rows } from "@/lib/telegram";
import { fmtSum, normVin, parseFields, sanitize, type DocFields } from "./shared";
import { findSimilarCars, type Candidate } from "./match";
import type { TelegramDoc } from "@prisma/client";

const ROLE_LABEL: Record<string, string> = { SALE: "ПРОДАЖА", PURCHASE: "ПОКУПКА", EXPENSE: "РАСХОД", STATEMENT: "ВЫПИСКА" };
const CAPTION_LIMIT = 1000; // лимит Telegram на подпись — 1024

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABEL[role]) || "ДОКУМЕНТ";
}

/** Строка-суть документа для карточек и списков. */
export function docSummary(f: DocFields): string {
  const parts: string[] = [];
  if (f.role === "STATEMENT") {
    if (f.bank) parts.push(f.bank);
    if (f.statementNumber) parts.push(`Nr ${f.statementNumber}`);
    if (f.periodStart || f.periodEnd) parts.push(`${f.periodStart ?? "?"} – ${f.periodEnd ?? "?"}`);
    if (f.iban) parts.push(`IBAN …${f.iban.replace(/s/g, "").slice(-4)}`);
    if (f.openingBalance != null && f.closingBalance != null) parts.push(`сальдо ${fmtSum(f.openingBalance)} → ${fmtSum(f.closingBalance)} €`);
    return parts.join(" · ") || "данные не распознаны";
  }
  if (f.role === "EXPENSE") {
    if (f.vendor) parts.push(f.vendor);
    if (f.item) parts.push(f.item);
    if (f.amount != null) parts.push(`${fmtSum(f.amount)} €`);
    if (f.vatAmount) parts.push(`в т.ч. НДС ${fmtSum(f.vatAmount)} €`);
    if (f.invoiceNumber) parts.push(`№ ${f.invoiceNumber}`);
  } else {
    const car = [f.make, f.model].filter(Boolean).join(" ");
    if (car) parts.push(car);
    if (f.price != null) parts.push(`${fmtSum(f.price)} €`);
    if (f.counterpartyName) parts.push(`${f.role === "SALE" ? "покупатель" : "продавец"}: ${f.counterpartyName}`);
    if (f.mileageKm) parts.push(`${f.mileageKm} км`);
  }
  const vin = normVin(f.vin);
  if (vin) parts.unshift(`VIN ${vin}`);
  if (f.date) parts.push(f.date);
  return parts.join(" · ") || "данные не распознаны";
}

/** Имя файла в чате — с ролью, VIN и суммой, чтобы по названию было понятно, что это. */
export function displayFileName(doc: Pick<TelegramDoc, "fileName" | "fieldsJson" | "role" | "pageLabel">): string {
  const f = parseFields(doc.fieldsJson);
  const ext = path.extname(doc.fileName) || ".pdf";
  const amount = f.role === "EXPENSE" ? f.amount : f.price;
  const bits = [
    roleLabel(doc.role),
    f.role === "STATEMENT" ? f.periodEnd?.slice(0, 7) : null,
    f.role === "STATEMENT" && f.statementNumber ? `Nr${f.statementNumber}` : null,
    normVin(f.vin),
    amount != null ? `${fmtSum(amount)}€` : null,
    doc.pageLabel?.replace(/\s/g, ""),
  ].filter(Boolean);
  return sanitize(`${bits.join(" ")}${ext}`).slice(0, 120);
}

/** Похожие машины для подвешенной продажи без карточки — считаем при каждой отрисовке, чтобы подсказка была актуальной. */
async function candidatesFor(doc: TelegramDoc): Promise<Candidate[]> {
  if (doc.status !== "HANGING" || doc.code !== "NO_CAR" || doc.role !== "SALE") return [];
  return findSimilarCars(parseFields(doc.fieldsJson));
}

export function caption(doc: TelegramDoc, candidates?: Candidate[]): string {
  const f = parseFields(doc.fieldsJson);
  const src = `${doc.fileName}${doc.pageLabel ? `, ${doc.pageLabel}` : ""}`;
  const lines: string[] = [];
  if (doc.status === "PENDING") {
    lines.push(`📥 ${roleLabel(doc.role)} — ждёт подтверждения`);
    lines.push(`Файл: ${src}`);
    lines.push(docSummary(f));
    if (f.vinReadAs) lines.push(`VIN исправлен: в договоре было ${f.vinReadAs}`);
    lines.push("", "Сохранить в базу?");
  } else {
    lines.push(`⏳ ПОДВЕШЕНО — ${roleLabel(doc.role)}`);
    lines.push(`Файл: ${src}`);
    lines.push(docSummary(f));
    lines.push("", `Причина: ${doc.reason ?? "—"}`);
    if (candidates?.length) {
      lines.push("", "Возможно, это одна из этих машин:");
      for (const c of candidates) lines.push(`• ${c.label} · ${c.vin} (${c.why})`);
    }
    lines.push("", "Ответьте на это сообщение текстом с правкой (что неверно/чего не хватает) или нажмите кнопку.");
  }
  return lines.join("\n").slice(0, CAPTION_LIMIT);
}

export function buttons(doc: TelegramDoc, candidates?: Candidate[]): Rows {
  if (doc.status === "PENDING") {
    return [
      [
        { text: "✅ Подтвердить", callback_data: `c:${doc.id}` },
        { text: "✏️ Исправить", callback_data: `e:${doc.id}` },
      ],
      [
        { text: "⏸ Отложить", callback_data: `h:${doc.id}` },
        { text: "🗑 Удалить", callback_data: `x:${doc.id}` },
      ],
    ];
  }
  const rows: Rows = [];
  if (doc.code === "DUPLICATE") rows.push([{ text: "➕ Всё равно создать (это другая машина)", callback_data: `n:${doc.id}` }]);
  for (const c of candidates ?? []) {
    rows.push([{ text: `✅ Это ${c.label} …${c.vin.slice(-6)}`, callback_data: `s:${doc.id}:${c.carId}` }]);
  }
  rows.push([
    { text: "🔄 Проверить снова", callback_data: `r:${doc.id}` },
    { text: "✏️ Исправить", callback_data: `e:${doc.id}` },
  ]);
  rows.push([{ text: "🗑 Удалить", callback_data: `x:${doc.id}` }]);
  return rows;
}

/** Отправляет карточку документа (файл + подпись + кнопки) и запоминает id сообщения. */
export async function sendCard(token: string, doc: TelegramDoc): Promise<void> {
  const candidates = await candidatesFor(doc);
  const id = await sendDocument(
    token,
    doc.chatId,
    Buffer.from(doc.fileBuffer),
    displayFileName(doc),
    doc.fileMimeType,
    caption(doc, candidates),
    buttons(doc, candidates)
  );
  if (id !== null) await prisma.telegramDoc.update({ where: { id: doc.id }, data: { cardMessageId: id } });
}

/** Обновляет существующую карточку на месте; если её нет (или правка не удалась) — присылает заново. */
export async function refreshCard(token: string, doc: TelegramDoc): Promise<void> {
  const candidates = await candidatesFor(doc);
  if (doc.cardMessageId) {
    const ok = await editCaption(token, doc.chatId, doc.cardMessageId, caption(doc, candidates), buttons(doc, candidates));
    if (ok) return;
  }
  await sendCard(token, doc);
}

/** Присылает карточку заново (внизу чата), убрав кнопки у старой — чтобы не было двух «живых» карточек. */
export async function resendCard(token: string, doc: TelegramDoc): Promise<void> {
  if (doc.cardMessageId) await clearButtons(token, doc.chatId, doc.cardMessageId);
  await sendCard(token, doc);
}
