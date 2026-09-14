import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documentToDTO } from "@/lib/serialize";
import { kindFromFileName, normalizeArchivePath } from "@/lib/archive";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: carId } = await params;
  const docs = await prisma.document.findMany({
    where: { carId },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(docs.map(documentToDTO));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: carId } = await params;
  const body = await req.json();

  const filePath = normalizeArchivePath(String(body.filePath ?? ""));
  if (!filePath) {
    return NextResponse.json({ error: "Укажите путь к файлу" }, { status: 400 });
  }

  const fileName = body.fileName
    ? String(body.fileName).trim()
    : filePath.split("/").pop() || filePath;

  // Тип берём из тела, иначе определяем по имени файла (раздел 6 ТЗ)
  const kind = body.kind ? body.kind : kindFromFileName(fileName);

  try {
    const doc = await prisma.document.create({
      data: {
        carId,
        kind,
        filePath,
        fileName,
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : null,
      },
    });
    return NextResponse.json(documentToDTO(doc), { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Этот файл уже привязан к машине" },
        { status: 409 }
      );
    }
    throw err;
  }
}
