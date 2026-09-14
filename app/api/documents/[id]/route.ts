import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentToDTO } from "@/lib/serialize";
import { normalizeArchivePath } from "@/lib/archive";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.kind !== undefined) data.kind = body.kind;
  if (body.fileName !== undefined) data.fileName = String(body.fileName).trim();
  if (body.filePath !== undefined)
    data.filePath = normalizeArchivePath(String(body.filePath));
  if (body.issuedAt !== undefined)
    data.issuedAt = body.issuedAt ? new Date(body.issuedAt) : null;

  const doc = await prisma.document.update({ where: { id }, data });
  return NextResponse.json(documentToDTO(doc));
}

/** Удаляет только ссылку в базе. Файл в архиве на диске не трогается. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
