import { prisma } from "@/lib/prisma";
import type { GeneralExpenseCategory } from "@/lib/types";

export type DocRole = "SALE" | "PURCHASE" | "EXPENSE" | "STATEMENT";

/** Поля документа, как их возвращает модель (см. TELEGRAM_DOCUMENT_PROMPT в lib/extractZulassung.ts). */
export type DocFields = {
  pages?: number[];
  role?: DocRole | null;
  vin?: string | null;
  price?: number | null;
  date?: string | null;
  counterpartyName?: string | null;
  counterpartyAddress?: string | null;
  mileageKm?: number | null;
  conditionNote?: string | null;
  make?: string | null;
  model?: string | null;
  firstRegistration?: string | null;
  owners?: number | null;
  isRealInvoice?: boolean | null;
  vendor?: string | null;
  item?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  vatAmount?: number | null;
  paymentMethod?: string | null;
  // Банковская выписка (role = "STATEMENT")
  statementNumber?: number | null;
  bank?: string | null;
  iban?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  /** Как VIN был прочитан из договора, если пользователь подтвердил, что это другая машина. */
  vinReadAs?: string | null;
  /** Пользователь подтвердил, что это НОВАЯ машина, хотя VIN похож на уже существующую. */
  forceNew?: boolean;
};

export function parseFields(json: string): DocFields {
  try {
    return JSON.parse(json) as DocFields;
  } catch {
    return {};
  }
}

export function normVin(vin: string | null | undefined): string | null {
  const v = vin?.trim().toUpperCase();
  return v ? v : null;
}

export function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

export function fmtSum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Та же эвристика, что и у кнопки "Проверить почту" (app/api/check-mail/route.ts). */
export function guessGeneralCategory(vendor: string, item: string): GeneralExpenseCategory {
  const s = `${vendor} ${item}`.toLowerCase();
  if (/tank|benzin|diesel|kraftstoff|fuel/.test(s)) return "FUEL";
  if (/steuerberat|buchführ|accounting/.test(s)) return "ACCOUNTING";
  if (/versicherung|insurance/.test(s)) return "INSURANCE";
  if (/kleinanzeigen|werbung|advertising|anzeige/.test(s)) return "ADVERTISING";
  if (/büro|office|drucker|toner|papier/.test(s)) return "OFFICE_SUPPLIES";
  if (/miete|rent/.test(s)) return "RENT";
  if (/bank|gebühr.*konto/.test(s)) return "BANK_FEES";
  if (/werkzeug|tool|ersatzteil|filter|öl\b/.test(s)) return "TOOLS";
  return "OTHER";
}

/**
 * Ищет уже существующий расход с той же суммой и датой (день в день) — либо привязанный
 * к машине (Expense), либо общий (GeneralExpense). Название/поставщик могут отличаться
 * (напр. один и тот же чек заносили дважды под разными названиями), поэтому сверяем
 * только по сумме и дате — этого достаточно, чтобы поймать повторную присылку того же чека.
 */
export async function findExistingExpenseTitle(amountCents: number, date: Date): Promise<string | null> {
  const general = await prisma.generalExpense.findFirst({ where: { amountCents, date } });
  if (general) return general.title;
  const expense = await prisma.expense.findFirst({ where: { amountCents, date } });
  return expense ? expense.title : null;
}
