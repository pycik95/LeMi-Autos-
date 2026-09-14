import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eurosToCents, generalExpenseToDTO } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.category !== undefined) data.category = body.category;
  if (body.amount !== undefined) data.amountCents = eurosToCents(Number(body.amount) || 0) ?? 0;
  if (body.vatAmount !== undefined)
    data.vatAmountCents =
      body.vatAmount === null || body.vatAmount === "" ? null : eurosToCents(Number(body.vatAmount));
  if (body.date !== undefined) data.date = body.date ? new Date(body.date) : null;
  if (body.invoiceNumber !== undefined)
    data.invoiceNumber = body.invoiceNumber ? String(body.invoiceNumber).trim() : null;
  if (body.filePath !== undefined) data.filePath = body.filePath ? String(body.filePath).trim() : null;
  if (body.fileName !== undefined) data.fileName = body.fileName ? String(body.fileName).trim() : null;
  if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;
  if (body.checkRunId !== undefined) data.checkRunId = body.checkRunId || null;

  const expense = await prisma.generalExpense.update({ where: { id }, data });
  return NextResponse.json(generalExpenseToDTO(expense));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.generalExpense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
