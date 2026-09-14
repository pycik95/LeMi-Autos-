-- CreateTable
CREATE TABLE "TelegramState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastUpdateId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
