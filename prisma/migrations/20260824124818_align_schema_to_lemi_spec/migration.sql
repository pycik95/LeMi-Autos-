/*
  Warnings:

  - You are about to drop the column `cashPrivateCost` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `doorsCount` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `engineCcm` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `envBadge` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `huValidUntil` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `intakeDate` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `ownersCount` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePrice` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `saleDate` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `salePrice` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `serviceFeeNet` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `zbIiNumber` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `isPrivate` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `vatAmount` on the `Expense` table. All the data in the column will be lost.
  - Made the column `vin` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `amountCents` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
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
    "serviceIncomeCents" INTEGER NOT NULL DEFAULT 0,
    "unofficialCashCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Car" ("bodyType", "color", "condition", "createdAt", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "make", "mileageKm", "model", "notes", "powerKw", "powerKwEstimated", "previousPlates", "status", "transmission", "updatedAt", "vin") SELECT "bodyType", "color", "condition", "createdAt", "emissionClass", "features", "firstRegistration", "fuelType", "id", "interiorMaterial", "make", "mileageKm", "model", "notes", "powerKw", "powerKwEstimated", "previousPlates", "status", "transmission", "updatedAt", "vin" FROM "Car";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("carId", "category", "createdAt", "date", "id", "invoiceNumber", "note", "title", "updatedAt") SELECT "carId", "category", "createdAt", "date", "id", "invoiceNumber", "note", "title", "updatedAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
