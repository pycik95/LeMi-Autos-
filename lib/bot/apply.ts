import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT, archiveFolderFor } from "@/lib/archive";
import { eurosToCents } from "@/lib/serialize";
import {
  findExistingExpenseTitle,
  fmtSum,
  guessGeneralCategory,
  isoDate,
  normVin,
  sanitize,
  type DocFields,
} from "./shared";

/** Кладёт файл в архив. Не удалось сохранить файл — данные всё равно заносим, путь будет null. */
function saveToArchive(docDate: Date, folderName: "Rechnungen" | "Kauferträge", fileName: string, buffer: Buffer) {
  const folder = archiveFolderFor(docDate, folderName);
  const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, fileName), buffer);
    return `${folder}/${fileName}`;
  } catch {
    return null;
  }
}

async function applySale(f: DocFields, vin: string, buffer: Buffer, ext: string): Promise<string> {
  const docDate = f.date ? new Date(f.date) : new Date();
  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return `VIN ${vin} не найден в базе — ничего не изменено.`;
  if (!f.price) return `VIN ${vin}: цена продажи не распознана — ничего не изменено.`;

  const fileName = sanitize(`Kaufertrag ${car.make} ${car.model} ${vin.slice(-4)} ${fmtSum(f.price)}${ext}`);
  const filePath = saveToArchive(docDate, "Kauferträge", fileName, buffer);

  const alreadySold =
    car.status === "SOLD" &&
    car.salePriceCents === Math.round(f.price * 100) &&
    !!car.soldAt &&
    isoDate(car.soldAt) === isoDate(docDate);

  const noteAddition = [
    f.counterpartyName ? `Покупатель: ${f.counterpartyName}${f.counterpartyAddress ? `, ${f.counterpartyAddress}` : ""}.` : null,
    f.conditionNote ? `Состояние: ${f.conditionNote}.` : null,
    f.vinReadAs ? `VIN в договоре прочитан как ${f.vinReadAs}, подтверждено вручную.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Повторное подтверждение того же договора (напр. ответ бота потерялся) — не дублируем заметки и данные.
  if (!alreadySold) await prisma.car.update({
    where: { id: car.id },
    data: {
      status: "SOLD",
      salePriceCents: Math.round(f.price * 100),
      soldAt: docDate,
      mileageKm: !car.mileageKm && f.mileageKm ? Math.round(f.mileageKm) : undefined,
      notes: noteAddition ? `${car.notes ? car.notes + " " : ""}${noteAddition}` : car.notes,
    },
  });

  if (filePath) {
    await prisma.document.upsert({
      where: { carId_filePath: { carId: car.id, filePath } },
      create: { carId: car.id, kind: "SALE_CONTRACT", filePath, fileName, issuedAt: docDate },
      update: {},
    });
  }

  if (alreadySold) {
    return `Продажа ${car.make} ${car.model} (VIN ${vin}) уже была зафиксирована ранее (${fmtSum(f.price)} €, ${isoDate(docDate)}) — данные повторно не менял, договор в архиве на месте.`;
  }
  return `Продажа ${car.make} ${car.model} (VIN ${vin}) зафиксирована: ${fmtSum(f.price)} €, ${isoDate(docDate)}.`;
}

async function applyPurchase(f: DocFields, vin: string, buffer: Buffer, ext: string): Promise<string> {
  const docDate = f.date ? new Date(f.date) : new Date();
  const existing = await prisma.car.findUnique({ where: { vin } });
  if (existing) return `VIN ${vin} уже есть в базе (${existing.make} ${existing.model}) — карточка не создана.`;
  if (!f.make || !f.model || !f.price) {
    return `VIN ${vin}: не хватает данных для карточки (марка/модель/цена) — ничего не создано.`;
  }

  const fileName = sanitize(`Ankauf ${f.make} ${f.model} ${vin.slice(-4)}${ext}`);
  const filePath = saveToArchive(docDate, "Rechnungen", fileName, buffer);

  const notes = [
    f.counterpartyName ? `Продавец: ${f.counterpartyName}${f.counterpartyAddress ? `, ${f.counterpartyAddress}` : ""}.` : null,
    "Создано ботом Telegram.",
  ]
    .filter(Boolean)
    .join(" ");

  // Новые машины начинают со статуса «В подготовке».
  const car = await prisma.car.create({
    data: {
      vin,
      make: f.make,
      model: f.model,
      mileageKm: f.mileageKm ? Math.round(f.mileageKm) : null,
      owners: f.owners ? Math.round(f.owners) : null,
      firstRegistration: f.firstRegistration ? new Date(f.firstRegistration) : null,
      purchasePriceCents: eurosToCents(f.price),
      invoiceDate: docDate,
      status: "IN_PREP",
      notes,
    },
  });

  if (filePath) {
    await prisma.document.upsert({
      where: { carId_filePath: { carId: car.id, filePath } },
      create: { carId: car.id, kind: "PURCHASE_INVOICE", filePath, fileName, issuedAt: docDate },
      update: {},
    });
  }

  return `Карточка создана: ${car.make} ${car.model} (VIN ${vin}), закупка ${fmtSum(f.price)} €, ${isoDate(docDate)}. Статус «В подготовке».`;
}

/** Обычный расход бизнеса — по аналогии с кнопкой "Проверить почту" (app/api/check-mail/route.ts). */
async function applyExpense(f: DocFields, vin: string | null, buffer: Buffer, ext: string): Promise<string> {
  if (!f.amount) return "Сумма расхода не распознана — ничего не создано.";
  const docDate = f.date ? new Date(f.date) : new Date();
  const amountCents = Math.round(f.amount * 100);

  // Подстраховка от задвоения: между показом карточки и нажатием кнопки запись могла появиться.
  const existingTitle = await findExistingExpenseTitle(amountCents, docDate);
  if (existingTitle) {
    return `Похоже, уже есть в базе («${existingTitle}», ${isoDate(docDate)}, ${fmtSum(f.amount)} €) — пропущено, не задвоено.`;
  }

  const vendor = (f.vendor || "Неизвестно").trim();
  const item = (f.item || "Без описания").trim();
  const vat = f.vatAmount != null && Math.abs(f.vatAmount) <= Math.abs(f.amount) ? f.vatAmount : null;
  const paymentSuffix = f.paymentMethod === "CASH" ? " (нал)" : f.paymentMethod === "CARD" ? " (карта)" : "";

  const fileName = sanitize(`${vendor} ${item} ${fmtSum(f.amount)}${paymentSuffix}${ext}`);
  const filePath = saveToArchive(docDate, "Rechnungen", fileName, buffer);

  const car = vin ? await prisma.car.findUnique({ where: { vin } }) : null;

  if (car) {
    await prisma.expense.create({
      data: {
        carId: car.id,
        title: item,
        category: "OTHER",
        amountCents,
        vatAmountCents: vat != null ? Math.round(vat * 100) : null,
        date: docDate,
        invoiceNumber: f.invoiceNumber || null,
        note: `Найдено ботом Telegram.${filePath ? ` Файл: ${filePath}.` : ""}`,
      },
    });
    return `Расход «${item}» (${fmtSum(f.amount)} €) добавлен машине ${car.make} ${car.model} (VIN ${vin}).`;
  }

  await prisma.generalExpense.create({
    data: {
      title: `${vendor} — ${item}`,
      category: guessGeneralCategory(vendor, item),
      amountCents,
      vatAmountCents: vat != null ? Math.round(vat * 100) : null,
      date: docDate,
      invoiceNumber: f.invoiceNumber || null,
      filePath,
      fileName: filePath ? fileName : null,
      note: "Найдено ботом Telegram.",
    },
  });

  return `Общий расход «${vendor} — ${item}» (${fmtSum(f.amount)} €) добавлен.`;
}

/** Применяет подтверждённый документ к базе и возвращает текст результата для чата. */
export async function applyDoc(f: DocFields, fileName: string, mimeType: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(fileName) || (mimeType === "application/pdf" ? ".pdf" : ".jpg");
  const vin = normVin(f.vin);
  if (f.role === "SALE") return applySale(f, vin!, buffer, ext);
  if (f.role === "PURCHASE") return applyPurchase(f, vin!, buffer, ext);
  return applyExpense(f, vin, buffer, ext);
}
