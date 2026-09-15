export type ExpenseForCalc = {
  amount: number;
  vatAmount: number | null;
};

export type CarForCalc = {
  purchasePrice: number | null | undefined;
  salePrice: number | null | undefined;
  taxScheme?: "MARGIN_25A" | "REGULAR_19";
  purchaseVat?: number | null; // входящий НДС на закупку — только при taxScheme=REGULAR_19
};

export type FinanceBreakdown = {
  purchasePrice: number;
  salePrice: number | null;
  // Основные величины:
  margin: number | null;
  vatDue: number | null;
  preTaxIncome: number | null; // доход по машине до общих расходов и подоходного налога
  // Промежуточные — только для раскрывающегося блока деталей:
  vatOnMargin: number | null;
  inputVat: number;
  grossExpenses: number;
  netExpenses: number | null;
  taxBase: number | null;
};

/**
 * Differenzbesteuerung (§25a UStG) profit calculation — по умолчанию для всех машин.
 * Пока машина не продана (нет salePrice) — все расчётные поля null, а не 0.
 *
 * Редкое исключение — taxScheme=REGULAR_19 (Regelbesteuerung): машина продана с
 * обычным НДС 19% на полную цену продажи, а не с маржи (напр. когда закупка была
 * с выделенным входящим НДС). Тогда: НДС = цена продажи × 19/119 (минус вычитаемый
 * входящий НДС по расходам и по самой закупке — purchaseVat), а доход считается от
 * цены продажи БЕЗ НДС, а не от маржи.
 *
 * Подоходный налог здесь НЕ считается — общие расходы бизнеса (аренда, бухгалтерия
 * и т.п.) не привязаны к конкретной машине, поэтому реальная налоговая база
 * считается только на уровне периода (см. app/report/page.tsx). Доп. услуги/
 * неофициальные расходы (PrivateEntry) тоже сюда не входят — это отдельный
 * учёт вне официального расчёта (см. components/PrivateEntriesPanel.tsx).
 */
export function calculateFinance(
  car: CarForCalc,
  expenses: ExpenseForCalc[]
): FinanceBreakdown {
  const purchasePriceKnown = car.purchasePrice !== null && car.purchasePrice !== undefined;
  const purchasePrice = car.purchasePrice ?? 0;
  const salePrice = car.salePrice ?? null;
  const isRegular = car.taxScheme === "REGULAR_19";
  const purchaseVat = car.purchaseVat ?? 0;

  const grossExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const inputVat = expenses.reduce((sum, e) => sum + (e.vatAmount || 0), 0);

  const sold = salePrice !== null;
  // Неизвестная закупочная цена у проданной машины — НЕ 0€: margin должен остаться
  // null (не считаем), иначе вся сумма продажи молча превращается в "прибыль" и
  // переплачивается налог/НДС (см. lib/audit.ts, раздел "нет закупочной цены").
  const margin = sold && purchasePriceKnown ? salePrice - purchasePrice : null;
  const netExpenses = sold ? grossExpenses - inputVat : null;

  let vatOnMargin: number | null;
  let vatDue: number | null;
  let taxBase: number | null;

  if (isRegular) {
    vatOnMargin = sold ? salePrice * (19 / 119) : null; // тут это НДС с полной цены продажи, не с маржи
    vatDue = vatOnMargin !== null ? vatOnMargin - inputVat - purchaseVat : null;
    taxBase =
      sold && purchasePriceKnown && vatOnMargin !== null && netExpenses !== null
        ? salePrice - vatOnMargin - purchasePrice - netExpenses
        : null;
  } else {
    vatOnMargin = margin !== null ? Math.max(margin, 0) * (19 / 119) : null;
    vatDue = vatOnMargin !== null ? vatOnMargin - inputVat : null;
    taxBase =
      margin !== null && vatOnMargin !== null && netExpenses !== null
        ? margin - vatOnMargin - netExpenses
        : null;
  }

  return {
    purchasePrice,
    salePrice,
    margin,
    vatDue,
    preTaxIncome: taxBase,
    vatOnMargin,
    inputVat,
    grossExpenses,
    netExpenses,
    taxBase,
  };
}

export function psToKw(ps: number): number {
  return ps * 0.7355;
}

export function kwToPs(kw: number): number {
  return kw / 0.7355;
}

export const CAR_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "В наличии",
  IN_PREP: "В подготовке",
  SOLD: "Продан",
};

export const CAR_SOURCE_LABELS: Record<string, string> = {
  CAR_ON_SALE: "CarOnSale",
  AUTO1: "AUTO1",
  COPART: "Copart",
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  PETROL: "Benzin",
  DIESEL: "Diesel",
  CNG: "Erdgas (CNG)",
  LPG: "Autogas (LPG)",
  HYBRID: "Hybrid",
  ELECTRIC: "Elektro",
  OTHER: "Andere Kraftstoffarten",
};

export const TRANSMISSION_LABELS: Record<string, string> = {
  MANUAL: "Механика",
  AUTOMATIC: "Автомат",
};

export const CAR_CONDITION_OPTIONS = ["Beschädigtes Fahrzeug", "Unbeschädigtes Fahrzeug"];

export const BODY_TYPE_OPTIONS = [
  "Kleinwagen",
  "Limousine",
  "Kombi",
  "Cabrio",
  "SUV/Geländewagen",
  "Van/Bus",
  "Coupé",
  "Andere Fahrzeugtypen",
];

export const DOORS_COUNT_OPTIONS = ["2/3", "4/5", "6/7", "Andere Türanzahl"];

export const COLOR_OPTIONS = [
  "Beige",
  "Blau",
  "Braun",
  "Gelb",
  "Gold",
  "Grau",
  "Grün",
  "Orange",
  "Rot",
  "Schwarz",
  "Silber",
  "Violet",
  "Weiß",
];

export const INTERIOR_MATERIAL_OPTIONS = [
  "Vollleder",
  "Teilleder",
  "Stoff",
  "Velours",
  "Alcantara",
  "Andere Materialien Innenausstattung",
];

export const FEATURE_GROUPS: { title: string; items: { code: string; label: string }[] }[] = [
  {
    title: "Außenausstattung",
    items: [
      { code: "TOW_BAR", label: "Anhängerkupplung" },
      { code: "ALLOY_WHEELS", label: "Leichtmetallfelgen" },
      { code: "PARK_ASSIST", label: "Einparkhilfe" },
      { code: "XENON_LED", label: "Xenon-/LED-Scheinwerfer" },
    ],
  },
  {
    title: "Innenausstattung",
    items: [
      { code: "AC", label: "Klimaanlage" },
      { code: "SUNROOF", label: "Schiebedach/Panoramadach" },
      { code: "NAVI", label: "Navigationssystem" },
      { code: "SEAT_HEATING", label: "Sitzheizung" },
      { code: "RADIO", label: "Radio/Tuner" },
      { code: "CRUISE_CONTROL", label: "Tempomat" },
      { code: "BLUETOOTH", label: "Bluetooth" },
      { code: "NON_SMOKER", label: "Nichtraucher-Fahrzeug" },
      { code: "HANDS_FREE", label: "Freisprecheinrichtung" },
    ],
  },
  {
    title: "Sicherheit",
    items: [
      { code: "ABS", label: "Antiblockiersystem (ABS)" },
      { code: "SERVICE_BOOK", label: "Scheckheftgepflegt" },
    ],
  },
];

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  AUCTION_FEE: "Аукционные сборы",
  DELIVERY: "Доставка",
  TUV: "Техосмотр (TÜV)",
  REPAIR: "Ремонт",
  REGISTRATION: "Регистрация",
  OTHER: "Прочее",
};

export const GENERAL_EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: "Аренда",
  TOOLS: "Инструмент/расходники",
  ACCOUNTING: "Бухгалтерия",
  TAXES: "Налоги/сборы",
  INSURANCE: "Страховка",
  FUEL: "Топливо",
  OFFICE_SUPPLIES: "Офис/канцелярия",
  BANK_FEES: "Банковские комиссии",
  ADVERTISING: "Реклама",
  OTHER: "Прочее",
};
