import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eurosToCents, generalExpenseToDTO } from "@/lib/serialize";

export async function GET() {
  const expenses = await prisma.generalExpense.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(expenses.map(generalExpenseToDTO));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  }

  const expense = await prisma.generalExpense.create({
    data: {
      title,
      category: body.category || "OTHER",
      amountCents: eurosToCents(Number(body.amount) || 0) ?? 0,
      vatAmountCents:
        body.vatAmount === null || body.vatAmount === undefined || body.vatAmount === ""
          ? null
          : eurosToCents(Number(body.vatAmount)),
      date: body.date ? new Date(body.date) : null,
      invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber).trim() : null,
      filePath: body.filePath ? String(body.filePath).trim() : null,
      fileName: body.fileName ? String(body.fileName).trim() : null,
      note: body.note ? String(body.note).trim() : null,
    },
  });

  return NextResponse.json(generalExpenseToDTO(expense), { status: 201 });
}
