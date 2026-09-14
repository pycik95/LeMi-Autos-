import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");

function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(-150);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: carId } = await params;

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) {
    return NextResponse.json({ error: "Машина не найдена" }, { status: 404 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const kind = (formData.get("kind") as string) || null;

  if (files.length === 0) {
    return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
  }

  const carDir = path.join(UPLOAD_ROOT, carId);
  await mkdir(carDir, { recursive: true });

  const created = [];
  for (const file of files) {
    const originalName = sanitizeName(file.name || "file");
    const storedName = `${randomUUID()}-${originalName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(carDir, storedName), buffer);

    const attachment = await prisma.attachment.create({
      data: {
        carId,
        filename: storedName,
        originalName,
        mimeType: file.type || null,
        sizeBytes: buffer.length,
        kind,
      },
    });
    created.push(attachment);
  }

  return NextResponse.json(created, { status: 201 });
}
