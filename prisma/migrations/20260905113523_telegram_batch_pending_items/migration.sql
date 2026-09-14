/*
  Warnings:

  - You are about to drop the column `fieldsJson` on the `TelegramPending` table. All the data in the column will be lost.
  - You are about to drop the column `fileBuffer` on the `TelegramPending` table. All the data in the column will be lost.
  - You are about to drop the column `fileMimeType` on the `TelegramPending` table. All the data in the column will be lost.
  - You are about to drop the column `fileOriginalName` on the `TelegramPending` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `TelegramPending` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TelegramPendingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pendingId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL,
    "fileBuffer" BLOB NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileOriginalName" TEXT NOT NULL,
    CONSTRAINT "TelegramPendingItem_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "TelegramPending" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TelegramPending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TelegramPending" ("chatId", "createdAt", "id") SELECT "chatId", "createdAt", "id" FROM "TelegramPending";
DROP TABLE "TelegramPending";
ALTER TABLE "new_TelegramPending" RENAME TO "TelegramPending";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
