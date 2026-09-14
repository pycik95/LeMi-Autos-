import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT, archiveFolderFor } from "@/lib/archive";
import { extractSaleContractFields } from "@/lib/extractZulassung";

type SaleFields = {
  vin?: string | null;
  salePrice?: number | null;
  saleDate?: string | null;
  buyerName?: string | null;
  buyerAddress?: string | null;
  mileageKm?: number | null;
  conditionNote?: string | null;
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}
function fmtSum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
  }

  const results: {
    fileName: string;
    ok: boolean;
    error?: string;
    carId?: string;
    carLabel?: string;
    salePrice?: number;
    saleDate?: string;
  }[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/pdf";

    const result = await extractSaleContractFields(buffer, mimeType);
    if (!result.ok) {
      results.push({ fileName: file.name, ok: false, error: result.error });
      continue;
    }
    const f = result.fields as SaleFields;
    const vin = f.vin ? f.vin.trim().toUpperCase() : null;
    if (!vin) {
      results.push({ fileName: file.name, ok: false, error: "VIN не распознан в документе" });
      continue;
    }

    const car = await prisma.car.findUnique({ where: { vin } });
    if (!car) {
      results.push({ fileName: file.name, ok: false, error: `VIN ${vin} не найден в базе` });
      continue;
    }
    if (!f.salePrice) {
      results.push({ fileName: file.name, ok: false, error: "Цена продажи не распознана" });
      continue;
    }

    const saleDate = f.saleDate ? new Date(f.saleDate) : new Date();
    const noteAddition = [
      f.buyerName ? `Покупатель: ${f.buyerName}${f.buyerAddress ? `, ${f.buyerAddress}` : ""}.` : null,
      f.conditionNote ? `Состояние: ${f.conditionNote}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    // Сохраняем файл в архив по той же схеме, что и весь остальной архив.
    const folder = archiveFolderFor(saleDate, "Kauferträge");
    const ext = path.extname(file.name) || ".pdf";
    const last4Vin = vin.slice(-4);
    const fileName = sanitize(
      `Kaufertrag ${car.make} ${car.model} ${last4Vin} ${fmtSum(f.salePrice)}${ext}`
    );
    const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
    let filePath: string | null = null;
    try {
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, fileName), buffer);
      filePath = `${folder}/${fileName}`;
    } catch {
      // не удалось сохранить файл — всё равно обновим карточку, просто без документа
    }

    await prisma.car.update({
      where: { id: car.id },
      data: {
        status: "SOLD",
        salePriceCents: Math.round(f.salePrice * 100),
        soldAt: saleDate,
        mileageKm: !car.mileageKm && f.mileageKm ? Math.round(f.mileageKm) : undefined,
        notes: noteAddition ? `${car.notes ? car.notes + " " : ""}${noteAddition}` : car.notes,
      },
    });

    if (filePath) {
      await prisma.document.create({
        data: { carId: car.id, kind: "SALE_CONTRACT", filePath, fileName, issuedAt: saleDate },
      });
    }

    results.push({
      fileName: file.name,
      ok: true,
      carId: car.id,
      carLabel: `${car.make} ${car.model}`,
      salePrice: f.salePrice,
      saleDate: saleDate.toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ results });
}
