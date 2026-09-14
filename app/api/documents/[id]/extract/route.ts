import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT } from "@/lib/archive";
import { extractDocumentFields, type DocumentType } from "@/lib/extractZulassung";
import { eurosToCents } from "@/lib/serialize";
import { normalizeMake } from "@/lib/makes";
import type { ExpenseCategory } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Тип счёта → категория расхода. */
const KIND_TO_EXPENSE_CATEGORY: Record<string, ExpenseCategory> = {
  FEE_INVOICE: "AUCTION_FEE",
  BNPL_INVOICE: "AUCTION_FEE", // комиссия за отсрочку — тоже аукционный сбор (раздел 3.2 ТЗ)
  TRANSPORT_INVOICE: "DELIVERY",
};

function mimeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  return "image/jpeg";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID", "OTHER"];
const TRANSMISSIONS = ["MANUAL", "AUTOMATIC"];

/** Нормализует "Euro 4" / "euro4" → "Euro4". */
function normalizeEmissionClass(raw: string): string {
  const m = raw.match(/euro\s*([0-9]+[a-z]?)/i);
  return m ? `Euro${m[1].toUpperCase()}` : raw.trim();
}

/**
 * Заполняет характеристики машины из распознанного документа.
 * Уже заполненные поля не трогает — документ только дополняет картину.
 */
function applyCarSpecFields(
  car: { [k: string]: unknown },
  f: Record<string, unknown>,
  data: Record<string, unknown>,
  applied: string[]
) {
  const setIfEmpty = (field: string, value: unknown, label: string, shown?: string) => {
    if (value === null || value === undefined || value === "") return;
    const current = car[field];
    if (current !== null && current !== undefined && current !== "") return;
    data[field] = value;
    applied.push(`${label} → ${shown ?? value}`);
  };

  const make = str(f.make);
  setIfEmpty("make", make ? normalizeMake(make) : null, "марка");

  setIfEmpty("color", str(f.color), "цвет");
  setIfEmpty("previousPlates", str(f.previousPlates), "прежние номера");
  setIfEmpty("zb2Number", str(f.zbIiNumber), "номер ZB II");

  const ccm = num(f.engineCcm);
  setIfEmpty("displacementCcm", ccm === null ? null : Math.round(ccm), "объём", `${ccm} см³`);

  const kw = num(f.powerKw);
  if (kw !== null && (car.powerKw === null || car.powerKw === undefined)) {
    data.powerKw = kw;
    data.powerKwEstimated = false;
    applied.push(`мощность → ${kw} кВт`);
  }

  const owners = num(f.owners);
  setIfEmpty("owners", owners === null ? null : Math.round(owners), "владельцев");

  const emission = str(f.emissionClass);
  setIfEmpty(
    "emissionClass",
    emission ? normalizeEmissionClass(emission) : null,
    "класс токсичности"
  );

  const doors = str(f.doors);
  setIfEmpty("doors", doors, "дверей");

  setIfEmpty("bodyType", str(f.bodyType), "тип кузова");

  const fuel = str(f.fuelType)?.toUpperCase();
  // fuelType в БД не nullable (default PETROL) — меняем, только если документ говорит иное
  if (fuel && FUEL_TYPES.includes(fuel) && car.fuelType === "PETROL" && fuel !== "PETROL") {
    data.fuelType = fuel;
    applied.push(`топливо → ${fuel}`);
  }

  const trans = str(f.transmission)?.toUpperCase();
  if (trans && TRANSMISSIONS.includes(trans)) {
    setIfEmpty("transmission", trans, "коробка");
  }

  const firstReg = dateOf(f.firstRegistration);
  setIfEmpty(
    "firstRegistration",
    firstReg,
    "первая регистрация",
    firstReg?.toISOString().slice(0, 10)
  );

  // Модель дополняем, только если документ дал более подробную
  const model = str(f.model);
  if (model && typeof car.model === "string" && model.length > car.model.length) {
    data.model = model;
    applied.push(`модель → ${model}`);
  }
}

function dateOf(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Распознаёт документ из архива и применяет данные:
 * — счёт на машину → заполняет пустые поля машины (VIN, цена, пробег, дата счёта)
 * — счёт за сборы/транспорт/отсрочку → создаёт расход
 *
 * Уже заполненные поля НЕ перезаписываются.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    include: { car: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  const abs = path.join(ARCHIVE_ROOT, doc.filePath.replace(/\//g, path.sep));
  let buffer: Buffer;
  try {
    buffer = await readFile(abs);
  } catch {
    return NextResponse.json(
      { error: `Файл не найден на диске: ${abs}` },
      { status: 404 }
    );
  }

  const isPurchase = doc.kind === "PURCHASE_INVOICE";
  const isVehicleDoc = doc.kind === "ZB1" || doc.kind === "ZB2" || doc.kind === "FAHRZEUGSCHEIN";
  const docType: DocumentType = isVehicleDoc
    ? "zb1"
    : isPurchase
    ? "purchase_invoice"
    : "invoice";

  const result = await extractDocumentFields(buffer, mimeFor(doc.fileName), docType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }

  let f = result.fields as Record<string, unknown>;
  const applied: string[] = [];
  const warnings: string[] = [];

  // Документ был помечен OTHER (тип не читался из имени файла) — модель определила его
  // по содержимому. Уточняем тип в базе, дальше обрабатываем уже по настоящему типу.
  let effectiveKind: string = doc.kind;
  if (doc.kind === "OTHER") {
    const detected = str(f.invoiceType)?.toUpperCase();
    const MAP: Record<string, string> = {
      PURCHASE: "PURCHASE_INVOICE",
      FEE: "FEE_INVOICE",
      BNPL: "BNPL_INVOICE",
      TRANSPORT: "TRANSPORT_INVOICE",
    };
    const mapped = detected ? MAP[detected] : undefined;
    if (mapped) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { kind: mapped as never },
      });
      effectiveKind = mapped;
      applied.push(`тип документа → ${mapped}`);

      // Счёт на машину читаем заново специальным промптом: обычный промпт отдаёт
      // Gesamtbetrag, а для §25a нужна цена именно автомобиля, без сборов.
      if (mapped === "PURCHASE_INVOICE") {
        const again = await extractDocumentFields(
          buffer,
          mimeFor(doc.fileName),
          "purchase_invoice"
        );
        if (again.ok) {
          f = again.fields as Record<string, unknown>;
        } else {
          warnings.push(`не удалось перечитать как счёт на машину: ${again.error}`);
        }
      }
    } else {
      warnings.push("тип счёта не определён по содержимому — оставлен «Прочее»");
    }
  }

  // Техпаспорт → технические поля машины
  if (isVehicleDoc) {
    const car = doc.car;
    const data: Prisma.CarUncheckedUpdateInput = {};

    const vin = str(f.vin)?.toUpperCase().replace(/\s/g, "");
    const vinIsPlaceholder = /^(COS|AUTO1)-/.test(car.vin);
    if (vin && vinIsPlaceholder) {
      const clash = await prisma.car.findFirst({
        where: { vin, NOT: { id: car.id } },
        select: { id: true },
      });
      if (clash) {
        warnings.push(`VIN ${vin} уже есть у другой машины — оставил заглушку`);
      } else {
        data.vin = vin;
        applied.push(`VIN → ${vin}`);
      }
    } else if (vin && !vinIsPlaceholder && vin !== car.vin) {
      warnings.push(`VIN в документе (${vin}) не совпадает с VIN машины (${car.vin}) — не менял`);
    }

    applyCarSpecFields(
      car as unknown as Record<string, unknown>,
      f,
      data as Record<string, unknown>,
      applied
    );

    if (Object.keys(data).length > 0) {
      await prisma.car.update({ where: { id: car.id }, data });
    }

    return NextResponse.json({
      kind: effectiveKind,
      fileName: doc.fileName,
      target: "car",
      applied,
      warnings,
      fields: f,
    });
  }

  if (effectiveKind === "PURCHASE_INVOICE") {
    const car = doc.car;
    const data: Prisma.CarUncheckedUpdateInput = {};

    // VIN: заполняем, только если сейчас заглушка
    const vin = str(f.vin)?.toUpperCase().replace(/\s/g, "");
    const vinIsPlaceholder = /^(COS|AUTO1)-/.test(car.vin);
    if (vin && vinIsPlaceholder) {
      const clash = await prisma.car.findFirst({
        where: { vin, NOT: { id: car.id } },
        select: { id: true },
      });
      if (clash) {
        warnings.push(`VIN ${vin} уже есть у другой машины — оставил заглушку`);
      } else {
        data.vin = vin;
        applied.push(`VIN → ${vin}`);
      }
    } else if (vin && !vinIsPlaceholder && vin !== car.vin) {
      warnings.push(`VIN в счёте (${vin}) не совпадает с VIN машины (${car.vin}) — не менял`);
    }

    const price = num(f.vehiclePrice);
    if (price !== null && car.purchasePriceCents === null) {
      data.purchasePriceCents = eurosToCents(price);
      applied.push(`закупка → ${price} €`);
      if (f.priceIsTotal === true) {
        warnings.push(
          `в счёте нет разбивки — взята общая сумма ${price} €, проверьте, не входят ли сборы`
        );
      }
    }

    const mileage = num(f.mileageKm);
    if (mileage !== null && car.mileageKm === null) {
      data.mileageKm = Math.round(mileage);
      applied.push(`пробег → ${Math.round(mileage)} км`);
    }

    const invDate = dateOf(f.invoiceDate);
    if (invDate && car.invoiceDate === null) {
      data.invoiceDate = invDate;
      applied.push(`дата счёта → ${invDate.toISOString().slice(0, 10)}`);
    }

    applyCarSpecFields(
      car as unknown as Record<string, unknown>,
      f,
      data as Record<string, unknown>,
      applied
    );

    if (!doc.issuedAt && invDate) {
      await prisma.document.update({ where: { id: doc.id }, data: { issuedAt: invDate } });
    }

    if (Object.keys(data).length > 0) {
      await prisma.car.update({ where: { id: car.id }, data });
    }

    return NextResponse.json({
      kind: effectiveKind,
      fileName: doc.fileName,
      target: "car",
      applied,
      warnings,
      fields: f,
    });
  }

  // Счёт за услугу → расход
  const category = KIND_TO_EXPENSE_CATEGORY[effectiveKind];
  if (!category) {
    return NextResponse.json({
      kind: effectiveKind,
      fileName: doc.fileName,
      target: "none",
      applied: [],
      warnings: ["тип документа не создаёт расход"],
      fields: f,
    });
  }

  const amount = num(f.amount);
  if (amount === null) {
    return NextResponse.json({
      kind: effectiveKind,
      fileName: doc.fileName,
      target: "expense",
      applied: [],
      warnings: ["не удалось прочитать сумму — расход не создан"],
      fields: f,
    });
  }

  const invoiceNumber = str(f.invoiceNumber);

  // Не плодим дубли при повторном прогоне
  const existing = await prisma.expense.findFirst({
    where: {
      carId: doc.carId,
      amountCents: eurosToCents(amount)!,
      ...(invoiceNumber ? { invoiceNumber } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({
      kind: effectiveKind,
      fileName: doc.fileName,
      target: "expense",
      applied: [],
      warnings: ["такой расход уже есть — пропущен"],
      fields: f,
    });
  }

  const invDate = dateOf(f.invoiceDate);
  await prisma.expense.create({
    data: {
      carId: doc.carId,
      title: str(f.sellerName) ?? doc.fileName,
      category,
      amountCents: eurosToCents(amount)!,
      vatAmountCents: eurosToCents(num(f.vatAmount)),
      date: invDate,
      invoiceNumber,
    },
  });

  if (!doc.issuedAt && invDate) {
    await prisma.document.update({ where: { id: doc.id }, data: { issuedAt: invDate } });
  }

  return NextResponse.json({
    kind: effectiveKind,
    fileName: doc.fileName,
    target: "expense",
    applied: [`расход ${amount} € (${category})`],
    warnings: num(f.vatAmount) === null ? ["НДС в счёте не найден — оставлен пустым"] : [],
    fields: f,
  });
}
