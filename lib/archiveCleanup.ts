import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT, normalizeArchivePath } from "@/lib/archive";

/** Путь к файлу архива из заметки расхода ("... Файл: 2026/Q3/.../x.pdf.") — у Expense нет отдельного поля. */
export function archivePathFromNote(note: string | null): string | null {
  if (!note) return null;
  const m = note.match(/(?:Файл|Скан):\s*(.+?\.(?:pdf|jpe?g|png))\.?(?:\s|$)/i);
  return m ? normalizeArchivePath(m[1].trim()) : null;
}

/**
 * Удаляет файлы из архива на диске, если на них больше ничего в базе не ссылается.
 * Вызывать ПОСЛЕ удаления записей из базы. Используется только при удалении
 * неподтверждённых (checkRunId != null) записей — их файлы скачала сама автопроверка;
 * у подтверждённых записей файл в архиве остаётся, удаляется только ссылка.
 */
export async function removeArchiveFilesIfUnreferenced(relPaths: (string | null)[]): Promise<void> {
  const unique = [...new Set(relPaths.filter((p): p is string => !!p).map(normalizeArchivePath))];
  for (const relPath of unique) {
    const [doc, gexp, service, expense] = await Promise.all([
      prisma.document.findFirst({ where: { filePath: relPath }, select: { id: true } }),
      prisma.generalExpense.findFirst({ where: { filePath: relPath }, select: { id: true } }),
      prisma.service.findFirst({ where: { filePath: relPath }, select: { id: true } }),
      prisma.expense.findFirst({ where: { note: { contains: relPath } }, select: { id: true } }),
    ]);
    if (doc || gexp || service || expense) continue;
    try {
      fs.unlinkSync(path.join(ARCHIVE_ROOT, relPath.replace(/\//g, path.sep)));
    } catch {
      // файла уже нет — ничего страшного
    }
  }
}
