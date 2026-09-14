/** Канонические написания марок. Ключ — верхний регистр без пробелов и дефисов. */
const CANONICAL_MAKES = [
  "Audi",
  "BMW",
  "Chrysler",
  "Citroen",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Opel",
  "Peugeot",
  "Porsche",
  "Renault",
  "Seat",
  "Skoda",
  "Smart",
  "Subaru",
  "Suzuki",
  "Toyota",
  "Volkswagen",
  "Volvo",
];

/** Синонимы и варианты написания → канонический ключ. */
const ALIASES: Record<string, string> = {
  VW: "Volkswagen",
  MERCEDES: "Mercedes-Benz",
  MERCEDESBENZ: "Mercedes-Benz",
  MB: "Mercedes-Benz",
  SKODA: "Skoda",
  "ŠKODA": "Skoda",
  "CITROËN": "Citroen",
};

const LOOKUP = new Map<string, string>();
for (const m of CANONICAL_MAKES) LOOKUP.set(m.toUpperCase().replace(/[\s-]/g, ""), m);
for (const [alias, canonical] of Object.entries(ALIASES)) {
  LOOKUP.set(alias.toUpperCase().replace(/[\s-]/g, ""), canonical);
}

/**
 * Приводит марку к каноническому виду.
 * В поле D.1 техпаспорта марка часто записана как "VOLKSWAGEN, VW" или капсом —
 * берём первую часть до запятой и ищем в справочнике.
 * Незнакомую марку не ломаем: возвращаем как есть, только подчищаем пробелы.
 */
export function normalizeMake(raw: string): string {
  const first = raw.split(",")[0].trim().replace(/\s+/g, " ");
  if (!first) return raw.trim();

  const known = LOOKUP.get(first.toUpperCase().replace(/[\s-]/g, ""));
  if (known) return known;

  // Незнакомая марка целиком в верхнем регистре — приводим к «Слово Слово»
  if (first === first.toUpperCase() && /[A-ZА-ЯÄÖÜ]/.test(first)) {
    return first
      .toLowerCase()
      .split(/([\s-])/)
      .map((part) => (/^[\s-]$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
  }

  return first;
}
