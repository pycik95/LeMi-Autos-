import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCarPayload } from "@/lib/carPayload";
import { carToDTO } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  const cars = await prisma.car.findMany({
    where: status ? { status: status as never } : undefined,
    include: { expenses: true },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(cars.map(carToDTO));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = parseCarPayload(body);

  if (!data.make || !data.model) {
    return NextResponse.json({ error: "Марка и модель обязательны" }, { status: 400 });
  }
  if (!data.vin) {
    return NextResponse.json({ error: "VIN обязателен — это ключ дедупликации" }, { status: 400 });
  }

  try {
    const car = await prisma.car.create({ data });
    return NextResponse.json(carToDTO(car), { status: 201 });
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
