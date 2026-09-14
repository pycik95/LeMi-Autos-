import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eurosToCents, expenseToDTO } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: carId } = await params;
  const body = await req.json();

  const expense = await prisma.expense.create({
    data: {
      carId,
      title: String(body.title ?? "").trim() || "Расход",
      category: body.category ?? "OTHER",
      amountCents: eurosToCents(Number(body.amount) || 0) ?? 0,
      vatAmountCents: body.vatAmount === null || body.vatAmount === undefined || body.vatAmount === ""
        ? null
        : eurosToCents(Number(body.vatAmount)),
      date: body.date ? new Date(body.date) : null,
      invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber).trim() : null,
      note: body.note ? String(body.note).trim() : null,
    },
  });

  return NextResponse.json(expenseToDTO(expense), { status: 201 });
}
