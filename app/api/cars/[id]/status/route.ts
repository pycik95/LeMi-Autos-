import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { carToDTO } from "@/lib/serialize";
import type { CarStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const VALID: CarStatus[] = ["IN_STOCK", "IN_PREP", "SOLD"];

/**
 * Точечное изменение статуса машины — в отличие от PATCH /api/cars/[id], который делает
 * полный replace через parseCarPayload и требует весь текущий стейт формы.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const status = body.status as CarStatus;
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
  }
  const car = await prisma.car.update({ where: { id }, data: { status } });
  return NextResponse.json(carToDTO(car));
}
