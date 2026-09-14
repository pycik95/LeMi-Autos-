-- CreateTable
CREATE TABLE "TelegramPending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL,
    "fileBuffer" BLOB NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileOriginalName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
