-- CreateTable
CREATE TABLE "Car" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "vin" TEXT,
    "previousPlates" TEXT,
    "firstRegistration" DATETIME,
    "engineCcm" INTEGER,
    "powerKw" REAL,
    "powerKwEstimated" BOOLEAN NOT NULL DEFAULT false,
    "mileageKm" INTEGER,
    "ownersCount" INTEGER,
    "zbIiNumber" TEXT,
    "huValidUntil" DATETIME,
    "fuelType" TEXT NOT NULL DEFAULT 'PETROL',
    "purchasePrice" REAL,
    "salePrice" REAL,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "intakeDate" DATETIME,
    "saleDate" DATETIME,
    "serviceFeeNet" REAL NOT NULL DEFAULT 0,
    "cashPrivateCost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" REAL NOT NULL,
    "vatAmount" REAL NOT NULL DEFAULT 0,
    "date" DATETIME,
    "invoiceNumber" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "kind" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
