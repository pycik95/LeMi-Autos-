-- CreateTable
CREATE TABLE "TelegramIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "role" TEXT,
    "fieldsJson" TEXT NOT NULL,
    "fileBuffer" BLOB NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileOriginalName" TEXT NOT NULL
);
