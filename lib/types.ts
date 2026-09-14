export type CarStatus = "IN_STOCK" | "IN_PREP" | "SOLD";
export type CarSource = "CAR_ON_SALE" | "AUTO1" | "COPART";
export type FuelType = "PETROL" | "DIESEL" | "CNG" | "LPG" | "ELECTRIC" | "HYBRID" | "OTHER";
export type Transmission = "MANUAL" | "AUTOMATIC";
export type ExpenseCategory =
  | "AUCTION_FEE"
  | "DELIVERY"
  | "TUV"
  | "REPAIR"
  | "REGISTRATION"
  | "OTHER";
export type GeneralExpenseCategory =
  | "RENT"
  | "TOOLS"
  | "ACCOUNTING"
  | "TAXES"
  | "INSURANCE"
  | "FUEL"
  | "OFFICE_SUPPLIES"
  | "BANK_FEES"
  | "ADVERTISING"
  | "OTHER";
export type PrivateEntryKind = "INCOME" | "EXPENSE";
export type CheckRunKind = "MAIL" | "AUCTION" | "TELEGRAM";
export type DocumentKind =
  | "PURCHASE_INVOICE"
  | "FEE_INVOICE"
  | "TRANSPORT_INVOICE"
  | "BNPL_INVOICE"
  | "ZB1"
  | "ZB2"
  | "FAHRZEUGSCHEIN"
  | "SALE_CONTRACT"
  | "OTHER";

export interface DocumentDTO {
  id: string;
  carId: string;
  kind: DocumentKind;
  filePath: string; // относительно корня архива
  fileName: string;
  issuedAt: string | null;
  createdAt: string;
}

export interface ExpenseDTO {
  id: string;
  carId: string;
  title: string;
  category: ExpenseCategory;
  amount: number; // евро
  vatAmount: number | null; // евро, из счёта
  date: string | null;
  invoiceNumber: string | null;
  note: string | null;
  checkRunId: string | null;
}

export interface CheckRunDTO {
  id: string;
  kind: CheckRunKind;
  summary: string;
  itemsFound: number;
  createdAt: string;
}

export interface ServiceDTO {
  id: string;
  title: string;
  clientName: string | null;
  amount: number; // евро
  vatAmount: number | null; // евро
  date: string | null;
  invoiceNumber: string | null;
  filePath: string | null;
  fileName: string | null;
  note: string | null;
  createdAt: string;
}

export interface GeneralExpenseDTO {
  id: string;
  title: string;
  category: GeneralExpenseCategory;
  amount: number; // евро
  vatAmount: number | null; // евро
  date: string | null;
  invoiceNumber: string | null;
  filePath: string | null;
  fileName: string | null;
  note: string | null;
  createdAt: string;
  checkRunId: string | null;
}

export interface PrivateEntryDTO {
  id: string;
  kind: PrivateEntryKind;
  carId: string | null;
  title: string;
  amount: number; // евро
  date: string | null;
  note: string | null;
  createdAt: string;
}

export interface AttachmentDTO {
  id: string;
  carId: string;
  filename: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: string | null;
  createdAt: string;
}

export interface CarDTO {
  id: string;
  vin: string;
  make: string;
  model: string;
  color: string | null;
  previousPlates: string | null;
  firstRegistration: string | null;
  displacementCcm: number | null;
  powerKw: number | null;
  powerKwEstimated: boolean;
  mileageKm: number | null;
  owners: number | null;
  zb2Number: string | null;
  tuvUntil: string | null;
  fuelType: FuelType;
  transmission: Transmission | null;
  bodyType: string | null;
  doors: string | null;
  condition: string | null;
  umweltplakette: string | null;
  emissionClass: string | null;
  interiorMaterial: string | null;
  features: string | null;
  purchasePrice: number | null; // евро
  salePrice: number | null; // евро
  status: CarStatus;
  source: CarSource | null;
  lotNumber: string | null;
  invoiceDate: string | null;
  arrivedAt: string | null;
  soldAt: string | null;
  notes: string | null;
  checkRunId: string | null;
  createdAt: string;
  updatedAt: string;
  expenses?: ExpenseDTO[];
  attachments?: AttachmentDTO[];
  documents?: DocumentDTO[];
  privateEntries?: PrivateEntryDTO[];
}
