import type { CarDTO, CarStatus, CarSource, FuelType, Transmission } from "@/lib/types";
import { toDateInputValue } from "@/lib/format";

export interface CarFormState {
  vin: string;
  make: string;
  model: string;
  color: string;
  previousPlates: string;
  firstRegistration: string;
  displacementCcm: string;
  powerKw: string;
  powerKwEstimated: boolean;
  mileageKm: string;
  owners: string;
  zb2Number: string;
  tuvUntil: string;
  fuelType: FuelType;
  transmission: Transmission | "";
  bodyType: string;
  doors: string;
  condition: string;
  umweltplakette: string;
  emissionClass: string;
  interiorMaterial: string;
  features: string;
  purchasePrice: string;
  salePrice: string;
  taxScheme: "MARGIN_25A" | "REGULAR_19";
  purchaseVat: string;
  status: CarStatus;
  source: CarSource | "";
  lotNumber: string;
  invoiceDate: string;
  arrivedAt: string;
  soldAt: string;
  notes: string;
}

export const emptyCarForm: CarFormState = {
  vin: "",
  make: "",
  model: "",
  color: "",
  previousPlates: "",
  firstRegistration: "",
  displacementCcm: "",
  powerKw: "",
  powerKwEstimated: false,
  mileageKm: "",
  owners: "",
  zb2Number: "",
  tuvUntil: "",
  fuelType: "PETROL",
  transmission: "",
  bodyType: "",
  doors: "",
  condition: "",
  umweltplakette: "",
  emissionClass: "",
  interiorMaterial: "",
  features: "",
  purchasePrice: "",
  salePrice: "",
  taxScheme: "MARGIN_25A",
  purchaseVat: "",
  status: "IN_STOCK",
  source: "",
  lotNumber: "",
  invoiceDate: "",
  arrivedAt: toDateInputValue(new Date()),
  soldAt: "",
  notes: "",
};

export function carToFormState(car: CarDTO): CarFormState {
  return {
    vin: car.vin ?? "",
    make: car.make ?? "",
    model: car.model ?? "",
    color: car.color ?? "",
    previousPlates: car.previousPlates ?? "",
    firstRegistration: toDateInputValue(car.firstRegistration),
    displacementCcm: car.displacementCcm?.toString() ?? "",
    powerKw: car.powerKw?.toString() ?? "",
    powerKwEstimated: car.powerKwEstimated ?? false,
    mileageKm: car.mileageKm?.toString() ?? "",
    owners: car.owners?.toString() ?? "",
    zb2Number: car.zb2Number ?? "",
    tuvUntil: toDateInputValue(car.tuvUntil),
    fuelType: car.fuelType ?? "PETROL",
    transmission: car.transmission ?? "",
    bodyType: car.bodyType ?? "",
    doors: car.doors ?? "",
    condition: car.condition ?? "",
    umweltplakette: car.umweltplakette ?? "",
    emissionClass: car.emissionClass ?? "",
    interiorMaterial: car.interiorMaterial ?? "",
    features: car.features ?? "",
    purchasePrice: car.purchasePrice?.toString() ?? "",
    salePrice: car.salePrice?.toString() ?? "",
    taxScheme: car.taxScheme ?? "MARGIN_25A",
    purchaseVat: car.purchaseVat?.toString() ?? "",
    status: car.status ?? "IN_STOCK",
    source: car.source ?? "",
    lotNumber: car.lotNumber ?? "",
    invoiceDate: toDateInputValue(car.invoiceDate),
    arrivedAt: toDateInputValue(car.arrivedAt),
    soldAt: toDateInputValue(car.soldAt),
    notes: car.notes ?? "",
  };
}

/**
 * Собирает CarDTO из текущего состояния формы — чтобы экспорт объявления
 * показывал то, что пользователь видит на экране, включая несохранённые правки.
 */
export function formStateToCarDTO(state: CarFormState, base: CarDTO): CarDTO {
  const numOrNull = (v: string) => (v === "" ? null : Number(v));
  const dateOrNull = (v: string) => (v === "" ? null : new Date(v).toISOString());

  return {
    ...base,
    vin: state.vin,
    make: state.make,
    model: state.model,
    color: state.color || null,
    previousPlates: state.previousPlates || null,
    firstRegistration: dateOrNull(state.firstRegistration),
    displacementCcm: numOrNull(state.displacementCcm),
    powerKw: numOrNull(state.powerKw),
    powerKwEstimated: state.powerKwEstimated,
    mileageKm: numOrNull(state.mileageKm),
    owners: numOrNull(state.owners),
    zb2Number: state.zb2Number || null,
    tuvUntil: dateOrNull(state.tuvUntil),
    fuelType: state.fuelType,
    transmission: state.transmission || null,
    bodyType: state.bodyType || null,
    doors: state.doors || null,
    condition: state.condition || null,
    umweltplakette: state.umweltplakette || null,
    emissionClass: state.emissionClass || null,
    interiorMaterial: state.interiorMaterial || null,
    features: state.features || null,
    purchasePrice: numOrNull(state.purchasePrice),
    salePrice: numOrNull(state.salePrice),
    taxScheme: state.taxScheme,
    purchaseVat: numOrNull(state.purchaseVat),
    status: state.status,
    source: state.source || null,
    lotNumber: state.lotNumber || null,
    invoiceDate: dateOrNull(state.invoiceDate),
    arrivedAt: dateOrNull(state.arrivedAt),
    soldAt: dateOrNull(state.soldAt),
    notes: state.notes || null,
  };
}

export function formStateToFinanceInput(state: CarFormState) {
  return {
    purchasePrice: state.purchasePrice === "" ? 0 : Number(state.purchasePrice),
    salePrice: state.salePrice === "" ? null : Number(state.salePrice),
    taxScheme: state.taxScheme,
    purchaseVat: state.purchaseVat === "" ? null : Number(state.purchaseVat),
  };
}
