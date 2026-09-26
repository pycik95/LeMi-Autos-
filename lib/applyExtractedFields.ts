import type { CarFormState } from "@/lib/carForm";

export function applyExtractedFields(
  prev: CarFormState,
  fields: Record<string, unknown>
): CarFormState {
  const next = { ...prev };
  if (fields.make) next.make = String(fields.make);
  if (fields.model) next.model = String(fields.model);
  if (fields.color) next.color = String(fields.color);
  if (fields.vin) next.vin = String(fields.vin);
  if (fields.previousPlates) next.previousPlates = String(fields.previousPlates);
  if (fields.firstRegistration) next.firstRegistration = String(fields.firstRegistration);
  if (fields.engineCcm) next.displacementCcm = String(fields.engineCcm);
  if (fields.powerKw) {
    next.powerKw = String(fields.powerKw);
    next.powerKwEstimated = false;
  }
  if (fields.zbIiNumber) next.zb2Number = String(fields.zbIiNumber);
  if (fields.owners !== null && fields.owners !== undefined) next.owners = String(fields.owners);
  if (fields.doors) next.doors = String(fields.doors);
  if (fields.emissionClass) next.emissionClass = String(fields.emissionClass);
  if (typeof fields.fuelType === "string" && FUEL_TYPES.includes(fields.fuelType)) {
    next.fuelType = fields.fuelType as CarFormState["fuelType"];
  }
  return next;
}

const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID", "OTHER"];

/** Merges a recognized счёт покупки (purchase invoice) into the car's own fields. */
export function applyInvoiceToCarFields(
  prev: CarFormState,
  fields: Record<string, unknown>
): CarFormState {
  const next = { ...prev };
  if (fields.amount !== null && fields.amount !== undefined) {
    next.purchasePrice = String(fields.amount);
  }
  if (fields.mileageKm !== null && fields.mileageKm !== undefined && !prev.mileageKm) {
    next.mileageKm = String(Number(fields.mileageKm));
  }
  if (fields.vin && !prev.vin) {
    next.vin = String(fields.vin);
  }
  return next;
}

/** Builds a draft Expense payload from a recognized service/repair счёт. */
export function invoiceFieldsToExpensePayload(fields: Record<string, unknown>) {
  return {
    title: fields.sellerName ? String(fields.sellerName) : "Счёт",
    category: "OTHER" as const,
    amount: fields.amount !== null && fields.amount !== undefined ? Number(fields.amount) : 0,
    vatAmount: fields.vatAmount !== null && fields.vatAmount !== undefined ? Number(fields.vatAmount) : 0,
    date: fields.invoiceDate ? String(fields.invoiceDate) : null,
    invoiceNumber: fields.invoiceNumber ? String(fields.invoiceNumber) : null,
  };
}
