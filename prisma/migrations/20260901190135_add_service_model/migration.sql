-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "amountCents" INTEGER NOT NULL,
    "vatAmountCents" INTEGER,
    "date" DATETIME,
    "invoiceNumber" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
