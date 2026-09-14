import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eurosToCents, privateEntryToDTO } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.kind !== undefined) data.kind = body.kind === "EXPENSE" ? "EXPENSE" : "INCOME";
  if (body.carId !== undefined) data.carId = body.carId || null;
  if (body.amount !== undefined) data.amountCents = eurosToCents(Number(body.amount) || 0) ?? 0;
  if (body.date !== undefined) data.date = body.date ? new Date(body.date) : null;
  if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;

  const entry = await prisma.privateEntry.update({ where: { id }, data });
  return NextResponse.json(privateEntryToDTO(entry));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.privateEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
