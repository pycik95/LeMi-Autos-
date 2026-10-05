-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bank" TEXT,
    "iban" TEXT NOT NULL,
    "number" INTEGER,
    "periodStart" DATETIME,
    "periodEnd" DATETIME NOT NULL,
    "openingBalanceCents" INTEGER,
    "closingBalanceCents" INTEGER,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_iban_periodEnd_key" ON "BankStatement"("iban", "periodEnd");
