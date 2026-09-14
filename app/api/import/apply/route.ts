import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanArchive, splitMakeModel } from "@/lib/scanArchive";

/** Заглушка VIN для импортированной машины: настоящий VIN берётся из счёта/техпаспорта. */
function placeholderVin(source: string, identifier: string): string {
  return source === "CAR_ON_SALE" ? `COS-${identifier}` : `AUTO1-${identifier}`;
}

/**
 * Создаёт машины-заготовки и ссылки на документы по выбранным группам файлов.
 *
 * Умышленно НЕ заполняет VIN, цены и даты — их нет в именах файлов.
 * Раздел 7 ТЗ: не додумывать, чего нет в документе.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const keys: string[] = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) {
    return NextResponse.json({ error: "Не выбрано ни одной машины" }, { status: 400 });
  }

  const scan = await scanArchive();
  const selected = scan.cars.filter((c) => keys.includes(c.key));

  const existing = await prisma.car.findMany({
    select: { id: true, vin: true, lotNumber: true },
  });

  let carsCreated = 0;
  let carsMatched = 0;
  let documentsCreated = 0;
  let documentsSkipped = 0;
  const errors: string[] = [];

  for (const group of selected) {
    try {
      const match =
        group.source === "CAR_ON_SALE"
          ? existing.find((e) => e.vin.endsWith(group.identifier))
          : existing.find((e) => e.lotNumber === group.identifier);

      let carId: string;

      if (match) {
        carId = match.id;
        carsMatched++;
      } else {
        const vin = placeholderVin(group.source, group.identifier);
        const note =
          `Импортировано из архива, папка ${group.folder}.\n` +
          `VIN — заглушка (${vin}), в имени файла только ` +
          (group.source === "CAR_ON_SALE"
            ? `последние 4 цифры VIN: ${group.identifier}.`
            : `номер лота AUTO1: ${group.identifier}.`) +
          `\nЗакупочную цену, пробег и дату счёта нужно взять из счёта — в именах файлов их нет.`;

        const { make, model } = splitMakeModel(group.model);
        const created = await prisma.car.create({
          data: {
            vin,
            make,
            model,
            status: "IN_STOCK",
            source: group.source,
            lotNumber: group.source === "AUTO1" ? group.identifier : null,
            notes: note,
          },
        });
        carId = created.id;
        carsCreated++;
        existing.push({ id: created.id, vin, lotNumber: created.lotNumber });
      }

      for (const f of group.files) {
        const already = await prisma.document.findUnique({
          where: { carId_filePath: { carId, filePath: f.filePath } },
        });
        if (already) {
          documentsSkipped++;
          continue;
        }
        await prisma.document.create({
          data: {
            carId,
            kind: f.kind,
            filePath: f.filePath,
            fileName: f.fileName,
          },
        });
        documentsCreated++;
      }
    } catch (err) {
      errors.push(`${group.key}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return NextResponse.json({
    carsCreated,
    carsMatched,
    documentsCreated,
    documentsSkipped,
    errors,
  });
}
