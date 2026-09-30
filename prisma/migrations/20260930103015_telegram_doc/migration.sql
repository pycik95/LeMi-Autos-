-- CreateTable
CREATE TABLE "TelegramDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "reason" TEXT,
    "role" TEXT,
    "fieldsJson" TEXT NOT NULL,
    "fileBuffer" BLOB NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "pageLabel" TEXT,
    "cardMessageId" INTEGER
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TelegramState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastUpdateId" INTEGER NOT NULL DEFAULT 0,
    "menuChatIds" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TelegramState" ("id", "lastUpdateId", "updatedAt") SELECT "id", "lastUpdateId", "updatedAt" FROM "TelegramState";
DROP TABLE "TelegramState";
ALTER TABLE "new_TelegramState" RENAME TO "TelegramState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelegramDoc_chatId_status_idx" ON "TelegramDoc"("chatId", "status");
