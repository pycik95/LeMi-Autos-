-- CreateTable
CREATE TABLE "CheckRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Car" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "previousPlates" TEXT,
    "firstRegistration" DATETIME,
    "displacementCcm" INTEGER,
    "powerKw" REAL,
    "powerKwEstimated" BOOLEAN NOT NULL DEFAULT false,
    "mileageKm" INTEGER,
    "owners" INTEGER,
    "zb2Number" TEXT,
    "tuvUntil" DATETIME,
    "fuelType" TEXT NOT NULL DEFAULT 'PETROL',
    "transmission" TEXT,
    "bodyType" TEXT,
    "doors" TEXT,
    "condition" TEXT,
    "umweltplakette" TEXT,
    "emissionClass" TEXT,
    "interiorMaterial" TEXT,
    "features" TEXT,
    "purchasePriceCents" INTEGER,
    "salePriceCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "source" TEXT,
    "lotNumber" TEXT,
    "invoiceDate" DATETIME,
    "arrivedAt" DATETIME,
    "soldAt" DATETIME,
    "notes" TEXT,
    "checkRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Car_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "CheckRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Car" ("arrivedAt", "bodyType", "color", "condition", "createdAt", "displacementCcm", "doors", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "invoiceDate", "lotNumber", "make", "mileageKm", "model", "notes", "owners", "powerKw", "powerKwEstimated", "previousPlates", "purchasePriceCents", "salePriceCents", "soldAt", "source", "status", "transmission", "tuvUntil", "umweltplakette", "updatedAt", "vin", "zb2Number") SELECT "arrivedAt", "bodyType", "color", "condition", "createdAt", "displacementCcm", "doors", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "invoiceDate", "lotNumber", "make", "mileageKm", "model", "notes", "owners", "powerKw", "powerKwEstimated", "previousPlates", "purchasePriceCents", "salePriceCents", "soldAt", "source", "status", "transmission", "tuvUntil", "umweltplakette", "updatedAt", "vin", "zb2Number" FROM "Car";
DROP TABLE "Car";
ALTER TABLE "new_Car" RENAME TO "Car";
CREATE UNIQUE INDEX "Car_vin_key" ON "Car"("vin");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "vatAmountCents" INTEGER,
    "date" DATETIME,
    "invoiceNumber" TEXT,
    "note" TEXT,
    "checkRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "CheckRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountCents", "carId", "category", "createdAt", "date", "id", "invoiceNumber", "note", "title", "updatedAt", "vatAmountCents") SELECT "amountCents", "carId", "category", "createdAt", "date", "id", "invoiceNumber", "note", "title", "updatedAt", "vatAmountCents" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE TABLE "new_GeneralExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "vatAmountCents" INTEGER,
    "date" DATETIME,
    "invoiceNumber" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "note" TEXT,
    "checkRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GeneralExpense_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "CheckRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GeneralExpense" ("amountCents", "category", "createdAt", "date", "fileName", "filePath", "id", "invoiceNumber", "note", "title", "updatedAt", "vatAmountCents") SELECT "amountCents", "category", "createdAt", "date", "fileName", "filePath", "id", "invoiceNumber", "note", "title", "updatedAt", "vatAmountCents" FROM "GeneralExpense";
DROP TABLE "GeneralExpense";
ALTER TABLE "new_GeneralExpense" RENAME TO "GeneralExpense";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
