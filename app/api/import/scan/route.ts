import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanArchive } from "@/lib/scanArchive";

/**
 * Читает архив на диске и показывает, что можно импортировать.
 * Ничего не изменяет — только предпросмотр.
 */
export async function GET() {
  let scan;
  try {
    scan = await scanArchive();
  } catch (err) {
    return NextResponse.json(
      { error: `Не удалось прочитать архив: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }

  const existing = await prisma.car.findMany({
    select: { id: true, vin: true, make: true, model: true, lotNumber: true },
  });

  const cars = scan.cars.map((c) => {
    // COS: идентификатор — последние 4 цифры VIN. AUTO1: номер лота.
    const match =
      c.source === "CAR_ON_SALE"
        ? existing.find((e) => e.vin.endsWith(c.identifier))
        : existing.find((e) => e.lotNumber === c.identifier);

    return {
      ...c,
      existingCarId: match?.id ?? null,
      existingCarLabel: match ? `${match.make} ${match.model}` : null,
    };
  });

  return NextResponse.json({
    archiveRoot: scan.archiveRoot,
    totalFiles: scan.totalFiles,
    cars,
    unmatched: scan.unmatched,
    unmatchedCount: scan.unmatched.length,
  });
}
