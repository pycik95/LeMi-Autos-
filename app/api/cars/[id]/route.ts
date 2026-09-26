import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCarPayload } from "@/lib/carPayload";
import { carToDTO } from "@/lib/serialize";
import { unlink } from "fs/promises";
import { archivePathFromNote, removeArchiveFilesIfUnreferenced } from "@/lib/archiveCleanup";
import path from "path";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      expenses: { orderBy: { date: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }] },
      privateEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
    },
  });

  if (!car) {
    return NextResponse.json({ error: "Машина не найдена" }, { status: 404 });
  }
  return NextResponse.json(carToDTO(car));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const data = parseCarPayload(body);

  try {
    const car = await prisma.car.update({ where: { id }, data });
    return NextResponse.json(carToDTO(car));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: `Машина с VIN ${data.vin} уже есть в базе` },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const attachments = await prisma.attachment.findMany({ where: { carId: id } });
  for (const a of attachments) {
    try {
      await unlink(path.join(process.cwd(), "storage", "uploads", id, a.filename));
    } catch {
      // file already gone, ignore
    }
  }

  // Неподтверждённая карточка (автопроверка) — её счета в архив положила сама проверка,
  // поэтому при удалении убираем и их. У подтверждённой машины файлы архива не трогаем.
  const car = await prisma.car.findUnique({
    where: { id },
    select: { checkRunId: true, documents: { select: { filePath: true } }, expenses: { select: { note: true } } },
  });
  const archivePaths = car?.checkRunId
    ? [...car.documents.map((d) => d.filePath), ...car.expenses.map((e) => archivePathFromNote(e.note))]
    : [];

  await prisma.car.delete({ where: { id } });
  await removeArchiveFilesIfUnreferenced(archivePaths);
  return NextResponse.json({ ok: true });
}
