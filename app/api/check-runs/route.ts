import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRunToDTO } from "@/lib/serialize";
import type { CheckRunKind } from "@/lib/types";

/** Лог ручных проверок почты/аукционов — см. prisma/schema.prisma CheckRun. */
export async function GET() {
  const runs = await prisma.checkRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json(runs.map(checkRunToDTO));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const kind = body.kind as CheckRunKind;
  if (kind !== "MAIL" && kind !== "AUCTION") {
    return NextResponse.json({ error: "kind должен быть MAIL или AUCTION" }, { status: 400 });
  }
  const summary = String(body.summary || "").trim();
  if (!summary) {
    return NextResponse.json({ error: "summary обязателен" }, { status: 400 });
  }
  const itemsFound = Number(body.itemsFound) || 0;

  const run = await prisma.checkRun.create({ data: { kind, summary, itemsFound } });
  return NextResponse.json(checkRunToDTO(run), { status: 201 });
}
