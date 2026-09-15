import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT, archiveFolderFor } from "@/lib/archive";
import { extractMailInvoiceFields } from "@/lib/extractZulassung";
import type { GeneralExpenseCategory } from "@/lib/types";
import {
  getAccessToken,
  searchMessages,
  getMessage,
  getAttachment,
  findPdfAttachments,
} from "@/lib/gmail";

type MailFields = {
  invoiceType?: string | null;
  isRealInvoice?: boolean;
  vendor?: string | null;
  item?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  amount?: number | null;
  vatAmount?: number | null;
  vin?: string | null;
  paymentMethod?: string | null;
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function fmtSum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Ищет уже существующий расход с той же суммой и датой (день в день) — либо привязанный
 * к машине (Expense), либо общий (GeneralExpense). Ловит повторное занесение того же счёта
 * (напр. письмо пришло повторно, или счёт уже был занесён вручную/через сайт при заведении
 * карточки машины — см. lib/telegram.ts, та же защита у кнопки "Проверить Telegram").
 */
async function findExistingExpenseTitle(amountCents: number, date: Date): Promise<string | null> {
  const general = await prisma.generalExpense.findFirst({ where: { amountCents, date } });
  if (general) return general.title;
  const expense = await prisma.expense.findFirst({ where: { amountCents, date } });
  return expense ? expense.title : null;
}

function guessGeneralCategory(vendor: string, item: string): GeneralExpenseCategory {
  const s = `${vendor} ${item}`.toLowerCase();
  if (/tank|benzin|diesel|kraftstoff|fuel/.test(s)) return "FUEL";
  if (/steuerberat|buchführ|accounting/.test(s)) return "ACCOUNTING";
  if (/versicherung|insurance/.test(s)) return "INSURANCE";
  if (/kleinanzeigen|werbung|advertising|anzeige/.test(s)) return "ADVERTISING";
  if (/büro|office|drucker|toner|papier/.test(s)) return "OFFICE_SUPPLIES";
  if (/miete|rent/.test(s)) return "RENT";
  if (/bank|gebühr.*konto/.test(s)) return "BANK_FEES";
  if (/werkzeug|tool|ersatzteil|filter|öl\b/.test(s)) return "TOOLS";
  return "OTHER";
}

export async function POST() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ needsAuth: true }, { status: 409 });
  }

  const lastRun = await prisma.checkRun.findFirst({
    where: { kind: "MAIL" },
    orderBy: { createdAt: "desc" },
  });
  const since = lastRun ? lastRun.createdAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

  let messageIds: string[];
  try {
    messageIds = await searchMessages(`has:attachment filename:pdf after:${sinceStr}`, accessToken);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  let itemsCreated = 0;
  let filesSaved = 0;
  let skippedDuplicate = 0;
  let skippedNotInvoice = 0;
  const carCache = new Map<string, string | null>();
  async function carIdByVin(vin: string): Promise<string | null> {
    if (carCache.has(vin)) return carCache.get(vin)!;
    const car = await prisma.car.findUnique({ where: { vin } });
    carCache.set(vin, car ? car.id : null);
    return car ? car.id : null;
  }

  const run = await prisma.checkRun.create({
    data: { kind: "MAIL", summary: `Проверено писем: ${messageIds.length}`, itemsFound: 0 },
  });

  for (const id of messageIds) {
    let message;
    try {
      message = await getMessage(id, accessToken);
    } catch {
      continue;
    }
    const attachments = findPdfAttachments(message.payload);
    for (const att of attachments) {
      let buffer: Buffer;
      try {
        buffer = await getAttachment(id, att.attachmentId, accessToken);
      } catch {
        continue;
      }

      const result = await extractMailInvoiceFields(buffer, "application/pdf");
      if (!result.ok) continue;
      const f = result.fields as MailFields;

      // Платёжное уведомление (напр. Zahlungsinformation от Billie GmbH) — не настоящий счёт,
      // никогда не заносим как расход, даже если в нём есть сумма. См. lib/extractZulassung.ts.
      if (f.isRealInvoice === false) {
        skippedNotInvoice++;
        continue;
      }
      if (!f.amount) continue; // без суммы запись бессмысленна

      const vendor = (f.vendor || "Неизвестно").trim();
      const item = (f.item || "Без описания").trim();
      const amount = f.amount;
      // Модель иногда путает НДС с посторонней суммой в документе (напр. письма из налоговой) —
      // НДС физически не может быть больше самой суммы счёта.
      const vat = f.vatAmount != null && Math.abs(f.vatAmount) <= Math.abs(amount) ? f.vatAmount : null;
      const invoiceDate = f.invoiceDate ? new Date(f.invoiceDate) : new Date();
      const paymentSuffix = f.paymentMethod === "CASH" ? " (нал)" : f.paymentMethod === "CARD" ? " (карта)" : "";

      // Общая подстраховка от задвоения — та же сумма и дата уже есть в базе (письмо пришло
      // повторно, или счёт уже занесён вручную/через сайт).
      const amountCents = Math.round(amount * 100);
      const existingTitle = await findExistingExpenseTitle(amountCents, invoiceDate);
      if (existingTitle) {
        skippedDuplicate++;
        continue;
      }

      const folder = archiveFolderFor(invoiceDate, "Rechnungen");
      const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
      const fileName = sanitize(`${vendor} ${item} ${fmtSum(amount)}${paymentSuffix}.pdf`);
      let filePath: string | null = null;
      try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(path.join(destDir, fileName), buffer);
        filePath = `${folder}/${fileName}`;
        filesSaved++;
      } catch {
        // не удалось сохранить файл — всё равно заносим данные, просто без filePath
      }

      const vin = f.vin ? f.vin.trim().toUpperCase() : null;
      const carId = vin ? await carIdByVin(vin) : null;

      if (carId) {
        await prisma.expense.create({
          data: {
            carId,
            title: item,
            category: "OTHER",
            amountCents,
            vatAmountCents: vat != null ? Math.round(vat * 100) : null,
            date: invoiceDate,
            note: `Найдено автопроверкой почты.${filePath ? ` Файл: ${filePath}.` : ""}`,
            checkRunId: run.id,
          },
        });
      } else {
        const note =
          f.invoiceType === "PURCHASE" && vin
            ? `Найдено автопроверкой почты. Похоже на счёт на покупку машины (VIN ${vin} не найден в базе) — завести карточку вручную.`
            : "Найдено автопроверкой почты.";
        await prisma.generalExpense.create({
          data: {
            title: `${vendor} — ${item}`,
            category: guessGeneralCategory(vendor, item),
            amountCents,
            vatAmountCents: vat != null ? Math.round(vat * 100) : null,
            date: invoiceDate,
            invoiceNumber: f.invoiceNumber || null,
            filePath,
            fileName: filePath ? fileName : null,
            note,
            checkRunId: run.id,
          },
        });
      }
      itemsCreated++;
    }
  }

  const skipNote =
    skippedDuplicate || skippedNotInvoice
      ? `, пропущено (не счёт): ${skippedNotInvoice}, пропущено (дубликат): ${skippedDuplicate}`
      : "";

  await prisma.checkRun.update({
    where: { id: run.id },
    data: {
      summary: `Писем просмотрено: ${messageIds.length}, создано записей: ${itemsCreated}, файлов сохранено: ${filesSaved}${skipNote}`,
      itemsFound: itemsCreated,
    },
  });

  return NextResponse.json({
    itemsFound: itemsCreated,
    summary: `Писем: ${messageIds.length}, записей: ${itemsCreated}, файлов: ${filesSaved}${skipNote}`,
  });
}
