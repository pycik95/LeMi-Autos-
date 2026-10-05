import type { DocumentKind } from "@/lib/types";

/** Корень архива на диске. Настраивается через ARCHIVE_ROOT в .env. */
export const ARCHIVE_ROOT =
  process.env.ARCHIVE_ROOT ?? "C:\\ОСНОВНАЯ ПАПКА\\LeMi Autos";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  PURCHASE_INVOICE: "Счёт на машину",
  FEE_INVOICE: "Счёт за сборы (Vermittlungsgebühr)",
  TRANSPORT_INVOICE: "Счёт за транспорт",
  BNPL_INVOICE: "Счёт за отсрочку (BNPL)",
  ZB1: "Zulassungsbescheinigung Teil I",
  ZB2: "Zulassungsbescheinigung Teil II",
  FAHRZEUGSCHEIN: "Fahrzeugschein",
  SALE_CONTRACT: "Kaufertrag (продажа)",
  OTHER: "Прочее",
};

/** Месяцы по-немецки — так называются папки в архиве. */
export const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export type ArchiveFolder = "Rechnungen" | "Fahrzeugdokumente" | "Kauferträge" | "Kontoauszüge";

/**
 * Папка архива по дате счёта: {Год}/Q{квартал}/{Месяц по-немецки}/{раздел}
 * Месяц определяется ДАТОЙ СЧЁТА, не датой покупки и не датой приезда на склад.
 */
export function archiveFolderFor(invoiceDate: Date, folder: ArchiveFolder): string {
  const year = invoiceDate.getFullYear();
  const quarter = Math.floor(invoiceDate.getMonth() / 3) + 1;
  const month = GERMAN_MONTHS[invoiceDate.getMonth()];
  return `${year}/Q${quarter}/${month}/${folder}`;
}

/**
 * Приводит путь к единому виду: обратные слэши → прямые, схлопывает повторы,
 * убирает слэши по краям. Пути в базе всегда в этом виде.
 */
export function normalizeArchivePath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

/** Полный путь на диске для показа пользователю. */
export function fullArchivePath(relativePath: string): string {
  return `${ARCHIVE_ROOT}\\${normalizeArchivePath(relativePath).replace(/\//g, "\\")}`;
}

/**
 * Идентификатор в имени файла: у COS — последние 4 цифры VIN (`2397`),
 * у AUTO1 — номер лота (`ND13354`). В ТЗ описан только вариант COS.
 */
export const IDENTIFIER_RE = /^(\d{4}|[A-Z]{1,3}\d{4,6})$/i;

/**
 * Суффиксы в имени файла → тип документа (раздел 6 ТЗ):
 * `Ankauf {COS|AUTO1} {Модель} {ID}{ тип}.{pdf|jpg}`
 * Пустой суффикс = счёт на машину.
 */
const FILENAME_SUFFIX_KINDS: { suffix: string; kind: DocumentKind }[] = [
  { suffix: "Vermittlungsgebühr", kind: "FEE_INVOICE" },
  { suffix: "Transport", kind: "TRANSPORT_INVOICE" },
  { suffix: "BNPL Gebühr", kind: "BNPL_INVOICE" },
  { suffix: "ZBI", kind: "ZB1" },
  { suffix: "Fahrzeugschein", kind: "FAHRZEUGSCHEIN" },
];

/**
 * Определяет тип документа по имени файла.
 * Суффикс " Main" в архиве встречается, но однозначного соответствия в ТЗ нет —
 * такие файлы помечаются OTHER, тип проставляется вручную.
 */
export function kindFromFileName(fileName: string): DocumentKind {
  const base = fileName.replace(/\.(pdf|jpe?g|png)$/i, "").trim();

  for (const { suffix, kind } of FILENAME_SUFFIX_KINDS) {
    if (base.toLowerCase().endsWith(suffix.toLowerCase())) return kind;
  }

  // "Ankauf COS A4 2397" / "Ankauf AUTO1 Kia Sorento ND13354" без суффикса — счёт на саму машину
  const lastToken = base.split(/\s+/).pop() ?? "";
  if (/^Ankauf\s+(COS|AUTO1)\s+/i.test(base) && IDENTIFIER_RE.test(lastToken)) {
    return "PURCHASE_INVOICE";
  }

  // "Kaufertrag {Марка} {Модель} {последние 4 VIN} {Сумма}" — договор продажи (дропзона на /cars, Telegram)
  if (/^Kaufertrag\s+/i.test(base)) {
    return "SALE_CONTRACT";
  }

  return "OTHER";
}
