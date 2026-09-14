import type { CarDTO } from "@/lib/types";
import { kwToPs, FUEL_TYPE_LABELS, FEATURE_GROUPS } from "@/lib/finance";

/** Немецкие подписи полей — ровно как в форме объявления Kleinanzeigen. */
export type ListingField = {
  label: string;
  value: string | null;
  /** Обязательное поле формы: без него объявление не подать. */
  required?: boolean;
};

function formatGermanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const MONTHS = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const TRANSMISSION_DE: Record<string, string> = {
  MANUAL: "Manuell",
  AUTOMATIC: "Automatik",
};

export function buildListingFields(car: CarDTO): ListingField[] {
  const ps = car.powerKw ? `${Math.round(kwToPs(car.powerKw))} PS` : null;

  return [
    { label: "Marke", value: car.make || null, required: true },
    { label: "Modell", value: car.model || null, required: true },
    {
      label: "Kilometerstand",
      value: car.mileageKm ? `${car.mileageKm.toLocaleString("de-DE")} km` : null,
      required: true,
    },
    { label: "Fahrzeugzustand", value: car.condition, required: true },
    { label: "Erstzulassung", value: formatGermanDate(car.firstRegistration), required: true },
    { label: "Kraftstoffart", value: FUEL_TYPE_LABELS[car.fuelType] ?? null },
    { label: "Leistung", value: ps },
    {
      label: "Getriebe",
      value: car.transmission ? TRANSMISSION_DE[car.transmission] ?? null : null,
    },
    { label: "Fahrzeugtyp", value: car.bodyType },
    { label: "Anzahl Türen", value: car.doors },
    { label: "HU bis", value: formatGermanDate(car.tuvUntil) },
    { label: "Umweltplakette", value: car.umweltplakette },
    { label: "Schadstoffklasse", value: car.emissionClass },
    { label: "Außenfarbe", value: car.color },
    { label: "Material Innenausstattung", value: car.interiorMaterial },
  ];
}

/** Отмеченные опции комплектации — немецкие подписи, как в форме. */
export function buildListingFeatures(car: CarDTO): string[] {
  const active = new Set(car.features ? car.features.split(",").filter(Boolean) : []);
  return FEATURE_GROUPS.flatMap((g) => g.items)
    .filter((i) => active.has(i.code))
    .map((i) => i.label);
}

/** Пустые обязательные поля — их нужно заполнить перед подачей объявления. */
export function missingRequiredFields(car: CarDTO): string[] {
  return buildListingFields(car)
    .filter((f) => f.required && !f.value)
    .map((f) => f.label);
}

/** Готовый текст для вставки в объявление. */
export function buildListingText(car: CarDTO): string {
  const fields = buildListingFields(car)
    .filter((f) => f.value)
    .map((f) => `${f.label}: ${f.value}`);

  const features = buildListingFeatures(car);
  const parts = [
    `${car.make} ${car.model}`.trim(),
    "",
    ...fields,
  ];

  if (features.length > 0) {
    parts.push("", "Ausstattung:", ...features.map((f) => `— ${f}`));
  }

  if (car.salePrice !== null) {
    parts.push("", `Preis: ${car.salePrice.toLocaleString("de-DE")} €`);
  }

  // §25a: в объявлении НДС не выделяется — продажа по марже.
  parts.push("", "Differenzbesteuert gemäß §25a UStG — MwSt. nicht ausweisbar.");

  return parts.join("\n");
}
