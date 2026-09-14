import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eurosToCents, privateEntryToDTO } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const carId = req.nextUrl.searchParams.get("carId");

  const entries = await prisma.privateEntry.findMany({
    where: carId ? { carId } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(entries.map(privateEntryToDTO));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  }
  const kind = body.kind === "EXPENSE" ? "EXPENSE" : "INCOME";
  if (kind === "INCOME" && !body.carId) {
    return NextResponse.json({ error: "Доход нужно привязать к машине" }, { status: 400 });
  }

  const entry = await prisma.privateEntry.create({
    data: {
      kind,
      carId: body.carId || null,
      title,
      amountCents: eurosToCents(Number(body.amount) || 0) ?? 0,
      date: body.date ? new Date(body.date) : null,
      note: body.note ? String(body.note).trim() : null,
    },
  });

  return NextResponse.json(privateEntryToDTO(entry), { status: 201 });
}
