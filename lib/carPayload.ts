import { Prisma } from "@prisma/client";
import { eurosToCents } from "@/lib/serialize";

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function date(v: unknown): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Builds a Prisma-ready update/create payload from a raw JSON body, tolerant of partial data. */
export function parseCarPayload(body: Record<string, unknown>): Prisma.CarUncheckedCreateInput {
  return {
    vin: str(body.vin) ?? "",
    make: str(body.make) ?? "",
    model: str(body.model) ?? "",
    color: str(body.color),
    previousPlates: str(body.previousPlates),
    firstRegistration: date(body.firstRegistration),
    displacementCcm: num(body.displacementCcm) ? Math.round(num(body.displacementCcm)!) : null,
    powerKw: num(body.powerKw),
    powerKwEstimated: bool(body.powerKwEstimated),
    mileageKm: num(body.mileageKm) ? Math.round(num(body.mileageKm)!) : null,
    owners: num(body.owners) ? Math.round(num(body.owners)!) : null,
    zb2Number: str(body.zb2Number),
    tuvUntil: date(body.tuvUntil),
    fuelType: (str(body.fuelType) as Prisma.CarUncheckedCreateInput["fuelType"]) ?? "PETROL",
    transmission: str(body.transmission) as Prisma.CarUncheckedCreateInput["transmission"],
    bodyType: str(body.bodyType),
    doors: str(body.doors),
    condition: str(body.condition),
    umweltplakette: str(body.umweltplakette),
    emissionClass: str(body.emissionClass),
    interiorMaterial: str(body.interiorMaterial),
    features: str(body.features),
    purchasePriceCents: eurosToCents(num(body.purchasePrice)),
    salePriceCents: eurosToCents(num(body.salePrice)),
    taxScheme:
      (str(body.taxScheme) as Prisma.CarUncheckedCreateInput["taxScheme"]) ?? "MARGIN_25A",
    purchaseVatCents: eurosToCents(num(body.purchaseVat)),
    status: (str(body.status) as Prisma.CarUncheckedCreateInput["status"]) ?? "IN_STOCK",
    source: str(body.source) as Prisma.CarUncheckedCreateInput["source"],
    lotNumber: str(body.lotNumber),
    invoiceDate: date(body.invoiceDate),
    arrivedAt: date(body.arrivedAt),
    soldAt: date(body.soldAt),
    notes: str(body.notes),
  };
}
