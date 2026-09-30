import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** Файл документа, присланного боту, — открыть на странице /check и посмотреть, что это. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.telegramDoc.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.fileBuffer), {
    headers: {
      "Content-Type": doc.fileMimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    },
  });
}

/** Убрать документ из очереди бота (не создаёт и не меняет ничего в учёте). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.telegramDoc.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
