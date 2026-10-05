import { prisma } from "@/lib/prisma";
import { findExistingExpenseTitle, normVin, parseFields, type DocFields } from "./shared";
import { findSimilarCars, levenshtein, type Candidate } from "./match";

/**
 * Единственное место, где решается, что делать с распознанным документом.
 *  - ok    — можно показать карточку и ждать «Подтвердить»;
 *  - hang  — «подвесить»: документ остаётся у бота с файлом и причиной, пока его не поправят
 *            или не появится карточка машины;
 *  - skip  — заведомо не нужно (дубль, платёжное уведомление) — только сообщить.
 */
export type Verdict =
  | { kind: "ok" }
  | { kind: "hang"; code: "NO_CAR" | "MISSING" | "UNKNOWN_TYPE" | "DUPLICATE"; reason: string; candidates?: Candidate[] }
  | { kind: "skip"; reason: string };

export async function judge(it: DocFields): Promise<Verdict> {
  const vin = normVin(it.vin);

  if (it.role === "STATEMENT") {
    const end = it.periodEnd ? new Date(it.periodEnd) : null;
    const iban = it.iban?.replace(/s/g, "").toUpperCase();
    if (!end || Number.isNaN(end.getTime())) return { kind: "hang", code: "MISSING", reason: "не распознан период выписки (дата конечного сальдо)" };
    if (!iban) return { kind: "hang", code: "MISSING", reason: "не распознан IBAN счёта" };
    const existing = await prisma.bankStatement.findUnique({ where: { iban_periodEnd: { iban, periodEnd: end } } });
    if (existing) return { kind: "skip", reason: `выписка за период по ${it.periodEnd} (IBAN …${iban.slice(-4)}) уже сохранена: ${existing.fileName}` };
    return { kind: "ok" };
  }

  if (!it.role) {
    return { kind: "hang", code: "UNKNOWN_TYPE", reason: "не удалось определить тип документа (продажа / покупка / расход)" };
  }

  if (it.role === "SALE") {
    if (!vin) return { kind: "hang", code: "MISSING", reason: "не распознан VIN" };
    if (!it.price) return { kind: "hang", code: "MISSING", reason: "не распознана цена продажи" };
    const car = await prisma.car.findUnique({ where: { vin } });
    if (car) return { kind: "ok" };

    // Карточки нет. Возможно, покупка ещё ждёт подтверждения в боте.
    const pendingPurchases = await prisma.telegramDoc.findMany({ where: { role: "PURCHASE", status: "PENDING" } });
    if (pendingPurchases.some((d) => normVin(parseFields(d.fieldsJson).vin) === vin)) {
      return {
        kind: "hang",
        code: "NO_CAR",
        reason: "покупка этой машины ещё не подтверждена в боте — подтвердите её, договор продажи подхватится сам",
      };
    }
    const candidates = await findSimilarCars(it);
    return {
      kind: "hang",
      code: "NO_CAR",
      reason: candidates.length
        ? `машины с VIN ${vin} нет в базе, но есть похожие — возможно, VIN прочитан с ошибкой`
        : `машины с VIN ${vin} пока нет в базе (не заведена или не проверен аукцион). Договор подождёт — как только карточка появится, бот сообщит`,
      candidates,
    };
  }

  if (it.role === "PURCHASE") {
    if (!vin) return { kind: "hang", code: "MISSING", reason: "не распознан VIN" };
    const missing = [!it.make && "марка", !it.model && "модель", !it.price && "цена"].filter(Boolean);
    if (missing.length) return { kind: "hang", code: "MISSING", reason: `не хватает данных: ${missing.join(", ")}` };
    const existing = await prisma.car.findUnique({ where: { vin } });
    if (existing) return { kind: "skip", reason: `машина с VIN ${vin} уже есть в базе (${existing.make} ${existing.model}) — карточка не нужна` };

    // Почти совпадающий VIN (1–2 символа) у той же марки — вероятно, ошибка чтения и дубль уже заведённой машины.
    if (!it.forceNew) {
      const all = await prisma.car.findMany({ select: { vin: true, make: true, model: true, status: true } });
      const near = all.filter(
        (c) => levenshtein(vin, c.vin.toUpperCase()) <= 2 && c.make.toLowerCase() === (it.make ?? "").toLowerCase()
      );
      if (near.length) {
        return {
          kind: "hang",
          code: "DUPLICATE",
          reason: `возможный ДУБЛЬ: в базе уже есть ${near.map((c) => `${c.make} ${c.model} · ${c.vin}`).join("; ")} (VIN отличается на 1–2 символа — возможно, ошибка чтения). Если это та же машина — удалите документ; если другая — «Всё равно создать»`,
        };
      }
    }
    return { kind: "ok" };
  }

  // EXPENSE. Платёжное уведомление посредника — не настоящий счёт (см. lib/extractZulassung.ts).
  if (it.isRealInvoice === false) {
    return { kind: "skip", reason: "это платёжное уведомление или накладная, а не счёт (нет слова «Rechnung») — не заношу как расход" };
  }
  if (!it.amount) return { kind: "hang", code: "MISSING", reason: "не распознана сумма" };
  const docDate = it.date ? new Date(it.date) : new Date();
  const existingTitle = await findExistingExpenseTitle(Math.round(it.amount * 100), docDate);
  if (existingTitle) {
    return { kind: "skip", reason: `похоже, уже есть в базе: «${existingTitle}» (${it.date}, ${it.amount} €)` };
  }
  return { kind: "ok" };
}
