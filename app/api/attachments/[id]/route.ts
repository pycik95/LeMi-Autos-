import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile, unlink } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ id: string }> };

const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_ROOT, attachment.carId, attachment.filename);
  try {
    const buffer = await readFile(filePath);
    const download = req.nextUrl.searchParams.get("download");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
          attachment.originalName
        )}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл отсутствует на диске" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  try {
    await unlink(path.join(UPLOAD_ROOT, attachment.carId, attachment.filename));
  } catch {
    // already gone
  }

  await prisma.attachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
