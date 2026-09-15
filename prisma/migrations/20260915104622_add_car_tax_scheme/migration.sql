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
    "taxScheme" TEXT NOT NULL DEFAULT 'MARGIN_25A',
    "purchaseVatCents" INTEGER,
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
INSERT INTO "new_Car" ("arrivedAt", "bodyType", "checkRunId", "color", "condition", "createdAt", "displacementCcm", "doors", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "invoiceDate", "lotNumber", "make", "mileageKm", "model", "notes", "owners", "powerKw", "powerKwEstimated", "previousPlates", "purchasePriceCents", "salePriceCents", "soldAt", "source", "status", "transmission", "tuvUntil", "umweltplakette", "updatedAt", "vin", "zb2Number") SELECT "arrivedAt", "bodyType", "checkRunId", "color", "condition", "createdAt", "displacementCcm", "doors", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "invoiceDate", "lotNumber", "make", "mileageKm", "model", "notes", "owners", "powerKw", "powerKwEstimated", "previousPlates", "purchasePriceCents", "salePriceCents", "soldAt", "source", "status", "transmission", "tuvUntil", "umweltplakette", "updatedAt", "vin", "zb2Number" FROM "Car";
DROP TABLE "Car";
ALTER TABLE "new_Car" RENAME TO "Car";
CREATE UNIQUE INDEX "Car_vin_key" ON "Car"("vin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
