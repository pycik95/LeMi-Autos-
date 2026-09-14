import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * Снимает пометку "создано автопроверкой" с машины (checkRunId → null), не трогая
 * остальные поля — в отличие от PATCH /api/cars/[id], который делает полный replace
 * через parseCarPayload и требует полный текущий стейт формы.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.car.update({ where: { id }, data: { checkRunId: null } });
  return NextResponse.json({ ok: true });
}
