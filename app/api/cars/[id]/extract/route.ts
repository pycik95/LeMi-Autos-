import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import { extractDocumentFields, type DocumentType } from "@/lib/extractZulassung";

type Params = { params: Promise<{ id: string }> };

const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");

export async function POST(req: NextRequest, { params }: Params) {
  const { id: carId } = await params;

  const body = await req.json();
  const attachmentId = body.attachmentId as string | undefined;
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId обязателен" }, { status: 400 });
  }

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.carId !== carId) {
    return NextResponse.json({ error: "Вложение не найдено" }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_ROOT, carId, attachment.filename);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Файл отсутствует на диске" }, { status: 404 });
  }

  const documentType: DocumentType = attachment.kind === "invoice" ? "invoice" : "zb1";
  const result = await extractDocumentFields(buffer, attachment.mimeType || "image/jpeg", documentType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  return NextResponse.json({ documentType, fields: result.fields });
}
