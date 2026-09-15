import type {
  Car,
  Expense,
  Attachment,
  Document as PrismaDocument,
  Service,
  GeneralExpense,
  PrivateEntry,
  CheckRun,
} from "@prisma/client";
import type {
  AttachmentDTO,
  CarDTO,
  DocumentDTO,
  ExpenseDTO,
  ServiceDTO,
  GeneralExpenseDTO,
  PrivateEntryDTO,
  CheckRunDTO,
} from "@/lib/types";

export function centsToEuros(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return cents / 100;
}

export function eurosToCents(euros: number | null | undefined): number | null {
  if (euros === null || euros === undefined || Number.isNaN(euros)) return null;
  return Math.round(euros * 100);
}

type CarWithRelations = Car & {
  expenses?: Expense[];
  attachments?: Attachment[];
  documents?: PrismaDocument[];
  privateEntries?: PrivateEntry[];
};

export function checkRunToDTO(run: CheckRun): CheckRunDTO {
  return {
    id: run.id,
    kind: run.kind as CheckRunDTO["kind"],
    summary: run.summary,
    itemsFound: run.itemsFound,
    createdAt: run.createdAt.toISOString(),
  };
}

export function carToDTO(car: CarWithRelations): CarDTO {
  return {
    id: car.id,
    vin: car.vin,
    make: car.make,
    model: car.model,
    color: car.color,
    previousPlates: car.previousPlates,
    firstRegistration: car.firstRegistration?.toISOString() ?? null,
    displacementCcm: car.displacementCcm,
    powerKw: car.powerKw,
    powerKwEstimated: car.powerKwEstimated,
    mileageKm: car.mileageKm,
    owners: car.owners,
    zb2Number: car.zb2Number,
    tuvUntil: car.tuvUntil?.toISOString() ?? null,
    fuelType: car.fuelType as CarDTO["fuelType"],
    transmission: car.transmission as CarDTO["transmission"],
    bodyType: car.bodyType,
    doors: car.doors,
    condition: car.condition,
    umweltplakette: car.umweltplakette,
    emissionClass: car.emissionClass,
    interiorMaterial: car.interiorMaterial,
    features: car.features,
    purchasePrice: centsToEuros(car.purchasePriceCents),
    salePrice: centsToEuros(car.salePriceCents),
    taxScheme: car.taxScheme as CarDTO["taxScheme"],
    purchaseVat: centsToEuros(car.purchaseVatCents),
    status: car.status as CarDTO["status"],
    source: car.source as CarDTO["source"],
    lotNumber: car.lotNumber,
    invoiceDate: car.invoiceDate?.toISOString() ?? null,
    arrivedAt: car.arrivedAt?.toISOString() ?? null,
    soldAt: car.soldAt?.toISOString() ?? null,
    notes: car.notes,
    checkRunId: car.checkRunId,
    createdAt: car.createdAt.toISOString(),
    updatedAt: car.updatedAt.toISOString(),
    expenses: car.expenses?.map(expenseToDTO),
    attachments: car.attachments?.map(attachmentToDTO),
    documents: car.documents?.map(documentToDTO),
    privateEntries: car.privateEntries?.map(privateEntryToDTO),
  };
}

export function documentToDTO(doc: PrismaDocument): DocumentDTO {
  return {
    id: doc.id,
    carId: doc.carId,
    kind: doc.kind as DocumentDTO["kind"],
    filePath: doc.filePath,
    fileName: doc.fileName,
    issuedAt: doc.issuedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function attachmentToDTO(attachment: Attachment): AttachmentDTO {
  return {
    id: attachment.id,
    carId: attachment.carId,
    filename: attachment.filename,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    kind: attachment.kind,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export function expenseToDTO(expense: Expense): ExpenseDTO {
  return {
    id: expense.id,
    carId: expense.carId,
    title: expense.title,
    category: expense.category as ExpenseDTO["category"],
    amount: centsToEuros(expense.amountCents) ?? 0,
    vatAmount: centsToEuros(expense.vatAmountCents),
    date: expense.date?.toISOString() ?? null,
    invoiceNumber: expense.invoiceNumber,
    note: expense.note,
    checkRunId: expense.checkRunId,
  };
}

export function generalExpenseToDTO(expense: GeneralExpense): GeneralExpenseDTO {
  return {
    id: expense.id,
    title: expense.title,
    category: expense.category as GeneralExpenseDTO["category"],
    amount: centsToEuros(expense.amountCents) ?? 0,
    vatAmount: centsToEuros(expense.vatAmountCents),
    date: expense.date?.toISOString() ?? null,
    invoiceNumber: expense.invoiceNumber,
    filePath: expense.filePath,
    fileName: expense.fileName,
    note: expense.note,
    createdAt: expense.createdAt.toISOString(),
    checkRunId: expense.checkRunId,
  };
}

export function privateEntryToDTO(entry: PrivateEntry): PrivateEntryDTO {
  return {
    id: entry.id,
    kind: entry.kind as PrivateEntryDTO["kind"],
    carId: entry.carId,
    title: entry.title,
    amount: centsToEuros(entry.amountCents) ?? 0,
    date: entry.date?.toISOString() ?? null,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function serviceToDTO(service: Service): ServiceDTO {
  return {
    id: service.id,
    title: service.title,
    clientName: service.clientName,
    amount: centsToEuros(service.amountCents) ?? 0,
    vatAmount: centsToEuros(service.vatAmountCents),
    date: service.date?.toISOString() ?? null,
    invoiceNumber: service.invoiceNumber,
    filePath: service.filePath,
    fileName: service.fileName,
    note: service.note,
    createdAt: service.createdAt.toISOString(),
  };
}
