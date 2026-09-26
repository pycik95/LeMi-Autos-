import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { ARCHIVE_ROOT, archiveFolderFor } from "@/lib/archive";
import { extractTelegramBatchFields } from "@/lib/extractZulassung";
import {
  getUpdates,
  downloadFile,
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  bestPhoto,
  type TelegramMessage,
  type TelegramCallbackQuery,
} from "@/lib/telegram";
import { eurosToCents } from "@/lib/serialize";
import type { GeneralExpenseCategory } from "@/lib/types";

type TelegramItem = {
  pages?: number[];
  role?: "SALE" | "PURCHASE" | "EXPENSE" | null;
  vin?: string | null;
  price?: number | null;
  date?: string | null;
  counterpartyName?: string | null;
  counterpartyAddress?: string | null;
  mileageKm?: number | null;
  conditionNote?: string | null;
  make?: string | null;
  model?: string | null;
  firstRegistration?: string | null;
  owners?: number | null;
  isRealInvoice?: boolean | null;
  vendor?: string | null;
  item?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  vatAmount?: number | null;
  paymentMethod?: string | null;
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}
function fmtSum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Та же эвристика, что и у кнопки "Проверить почту" (app/api/check-mail/route.ts). */
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

/**
 * Ищет уже существующий расход с той же суммой и датой (день в день) — либо привязанный
 * к машине (Expense), либо общий (GeneralExpense). Название/поставщик могут отличаться
 * (напр. один и тот же чек заносили дважды под разными названиями), поэтому сверяем
 * только по сумме и дате — этого достаточно, чтобы поймать повторную присылку того же чека.
 */
async function findExistingExpenseTitle(amountCents: number, date: Date): Promise<string | null> {
  const general = await prisma.generalExpense.findFirst({ where: { amountCents, date } });
  if (general) return general.title;
  const expense = await prisma.expense.findFirst({ where: { amountCents, date } });
  return expense ? expense.title : null;
}

/** Возвращает (file_id, mimeType) для фото/документа во входящем сообщении, либо null. */
function fileRefFromMessage(msg: TelegramMessage): { fileId: string; mimeType: string; name: string } | null {
  if (msg.photo && msg.photo.length > 0) {
    const p = bestPhoto(msg.photo);
    return { fileId: p.file_id, mimeType: "image/jpeg", name: `photo_${msg.message_id}.jpg` };
  }
  if (msg.document) {
    const mime = msg.document.mime_type || "";
    if (mime === "application/pdf" || mime.startsWith("image/")) {
      return { fileId: msg.document.file_id, mimeType: mime, name: msg.document.file_name || `doc_${msg.message_id}` };
    }
  }
  return null;
}

/** Вырезает страницы (1-индексация) исходного PDF в отдельный PDF — один документ пакетного скана. */
async function slicePdfPages(buffer: Buffer, pages: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < src.getPageCount());
  const copied = await out.copyPages(src, indices.length > 0 ? indices : [0]);
  for (const page of copied) out.addPage(page);
  const bytes = await out.save();
  return Buffer.from(bytes);
}

function summaryLineForItem(n: number, it: TelegramItem, vin: string | null): string {
  if (it.role === "SALE") {
    return [
      `${n}. ПРОДАЖА — VIN ${vin}, ${it.price} €, ${it.date}` +
        (it.counterpartyName ? `, покупатель: ${it.counterpartyName}` : ""),
    ].join("");
  }
  if (it.role === "PURCHASE") {
    return `${n}. ПОКУПКА у частника — ${it.make} ${it.model} (VIN ${vin}), ${it.price} €, ${it.date}`;
  }
  return `${n}. РАСХОД — ${it.vendor}, ${it.item}, ${it.amount} €${it.vatAmount ? ` (в т.ч. НДС ${it.vatAmount} €)` : ""}, ${it.date}${vin ? `, VIN ${vin}` : ""}`;
}

async function applySale(f: TelegramItem, vin: string, buffer: Buffer, ext: string): Promise<string> {
  const docDate = f.date ? new Date(f.date) : new Date();
  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return `VIN ${vin} не найден в базе — ничего не изменено.`;
  if (!f.price) return `VIN ${vin}: цена продажи не распознана — ничего не изменено.`;

  const last4Vin = vin.slice(-4);
  const folder = archiveFolderFor(docDate, "Kauferträge");
  const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
  const fileName = sanitize(`Kaufertrag ${car.make} ${car.model} ${last4Vin} ${fmtSum(f.price)}${ext}`);
  let filePath: string | null = null;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, fileName), buffer);
    filePath = `${folder}/${fileName}`;
  } catch {
    // не удалось сохранить файл — всё равно обновим карточку
  }

  const noteAddition = [
    f.counterpartyName ? `Покупатель: ${f.counterpartyName}${f.counterpartyAddress ? `, ${f.counterpartyAddress}` : ""}.` : null,
    f.conditionNote ? `Состояние: ${f.conditionNote}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.car.update({
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
    await prisma.document.create({
      data: { carId: car.id, kind: "SALE_CONTRACT", filePath, fileName, issuedAt: docDate },
    });
  }

  return `Продажа ${car.make} ${car.model} (VIN ${vin}) зафиксирована, цена ${fmtSum(f.price)} €, дата ${docDate.toISOString().slice(0, 10)}.`;
}

async function applyPurchase(f: TelegramItem, vin: string, buffer: Buffer, ext: string): Promise<string> {
  const docDate = f.date ? new Date(f.date) : new Date();
  const existing = await prisma.car.findUnique({ where: { vin } });
  if (existing) return `VIN ${vin} уже есть в базе (${existing.make} ${existing.model}) — карточка не создана.`;
  if (!f.make || !f.model || !f.price) {
    return `VIN ${vin}: не хватает данных для карточки (марка/модель/цена) — ничего не создано.`;
  }

  const last4Vin = vin.slice(-4);
  const folder = archiveFolderFor(docDate, "Rechnungen");
  const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
  const fileName = sanitize(`Ankauf ${f.make} ${f.model} ${last4Vin}${ext}`);
  let filePath: string | null = null;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, fileName), buffer);
    filePath = `${folder}/${fileName}`;
  } catch {
    // не удалось сохранить файл — всё равно создадим карточку
  }

  const notes = [
    f.counterpartyName ? `Продавец: ${f.counterpartyName}${f.counterpartyAddress ? `, ${f.counterpartyAddress}` : ""}.` : null,
    "Создано автопроверкой Telegram.",
  ]
    .filter(Boolean)
    .join(" ");

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
      status: "IN_STOCK",
      notes,
    },
  });

  if (filePath) {
    await prisma.document.create({
      data: { carId: car.id, kind: "PURCHASE_INVOICE", filePath, fileName, issuedAt: docDate },
    });
  }

  return `Карточка создана — ${car.make} ${car.model} (VIN ${vin}), закупка ${fmtSum(f.price)} €, дата ${docDate.toISOString().slice(0, 10)}.`;
}

/** Обычный расход бизнеса — по аналогии с кнопкой "Проверить почту" (app/api/check-mail/route.ts). */
async function applyExpense(f: TelegramItem, vin: string | null, buffer: Buffer, ext: string): Promise<string> {
  if (!f.amount) return "Сумма расхода не распознана — ничего не создано.";
  const docDate = f.date ? new Date(f.date) : new Date();
  const amountCents = Math.round(f.amount * 100);

  // Подстраховка от задвоения — основная проверка уже была на этапе показа подтверждения,
  // но повторяем её и здесь на случай, если между показом и нажатием кнопки запись уже появилась.
  const existingTitle = await findExistingExpenseTitle(amountCents, docDate);
  if (existingTitle) {
    return `Похоже, уже есть в базе ("${existingTitle}", ${docDate.toISOString().slice(0, 10)}, ${fmtSum(f.amount)} €) — пропущено, не задвоено.`;
  }

  const vendor = (f.vendor || "Неизвестно").trim();
  const item = (f.item || "Без описания").trim();
  const vat = f.vatAmount != null && Math.abs(f.vatAmount) <= Math.abs(f.amount) ? f.vatAmount : null;
  const paymentSuffix = f.paymentMethod === "CASH" ? " (нал)" : f.paymentMethod === "CARD" ? " (карта)" : "";

  const folder = archiveFolderFor(docDate, "Rechnungen");
  const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
  const fileName = sanitize(`${vendor} ${item} ${fmtSum(f.amount)}${paymentSuffix}${ext}`);
  let filePath: string | null = null;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, fileName), buffer);
    filePath = `${folder}/${fileName}`;
  } catch {
    // не удалось сохранить файл — всё равно занесём данные
  }

  const car = vin ? await prisma.car.findUnique({ where: { vin } }) : null;

  if (car) {
    await prisma.expense.create({
      data: {
        carId: car.id,
        title: item,
        category: "OTHER",
        amountCents: Math.round(f.amount * 100),
        vatAmountCents: vat != null ? Math.round(vat * 100) : null,
        date: docDate,
        invoiceNumber: f.invoiceNumber || null,
        note: `Найдено ботом Telegram.${filePath ? ` Файл: ${filePath}.` : ""}`,
      },
    });
    return `Расход "${item}" (${fmtSum(f.amount)} €) добавлен машине ${car.make} ${car.model} (VIN ${vin}).`;
  }

  await prisma.generalExpense.create({
    data: {
      title: `${vendor} — ${item}`,
      category: guessGeneralCategory(vendor, item),
      amountCents: Math.round(f.amount * 100),
      vatAmountCents: vat != null ? Math.round(vat * 100) : null,
      date: docDate,
      invoiceNumber: f.invoiceNumber || null,
      filePath,
      fileName: filePath ? fileName : null,
      note: "Найдено ботом Telegram.",
    },
  });

  return `Общий расход "${vendor} — ${item}" (${fmtSum(f.amount)} €) добавлен.`;
}

async function applyItem(role: string, fieldsJson: string, buffer: Buffer, ext: string): Promise<string> {
  const f = JSON.parse(fieldsJson) as TelegramItem;
  const vin = f.vin ? f.vin.trim().toUpperCase() : null;
  if (role === "SALE") return applySale(f, vin!, buffer, ext);
  if (role === "PURCHASE") return applyPurchase(f, vin!, buffer, ext);
  return applyExpense(f, vin, buffer, ext);
}

async function handleCallback(token: string, cb: TelegramCallbackQuery) {
  const data = cb.data ?? "";
  const [action, pendingId] = data.split(":");
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) {
    await answerCallbackQuery(token, cb.id);
    return;
  }

  const pending = await prisma.telegramPending.findUnique({
    where: { id: pendingId },
    include: { items: true },
  });
  if (!pending) {
    await answerCallbackQuery(token, cb.id, "Уже обработано или устарело");
    return;
  }

  if (action === "tg_cancel") {
    await prisma.telegramPending.delete({ where: { id: pending.id } });
    await answerCallbackQuery(token, cb.id, "Отменено");
    await editMessageText(token, chatId, messageId, "Отменено — ничего не создано и не изменено.");
    return;
  }

  if (action === "tg_confirm") {
    const results: string[] = [];
    for (const it of pending.items) {
      const buffer = Buffer.from(it.fileBuffer);
      const ext = path.extname(it.fileOriginalName) || (it.fileMimeType === "application/pdf" ? ".pdf" : ".jpg");
      try {
        const text = await applyItem(it.role, it.fieldsJson, buffer, ext);
        results.push(text);
      } catch (err) {
        results.push(`Ошибка при обработке: ${err instanceof Error ? err.message : err}`);
      }
    }

    await prisma.telegramPending.delete({ where: { id: pending.id } });
    await answerCallbackQuery(token, cb.id, "Готово");
    const summary = results.length === 1 ? results[0] : results.map((r, i) => `${i + 1}. ${r}`).join("\n");
    await editMessageText(token, chatId, messageId, `Готово:\n${summary}`);
  }
}

async function handleDocumentMessage(token: string, msg: TelegramMessage) {
  const ref = fileRefFromMessage(msg);
  if (!ref) return { hadDocument: false };

  let buffer: Buffer;
  try {
    buffer = await downloadFile(token, ref.fileId);
  } catch (err) {
    await sendMessage(token, msg.chat.id, `Не удалось скачать файл: ${err instanceof Error ? err.message : err}`);
    return { hadDocument: true };
  }

  const result = await extractTelegramBatchFields(buffer, ref.mimeType);
  if (!result.ok) {
    await sendMessage(token, msg.chat.id, `Не удалось распознать документ: ${result.error}`);
    return { hadDocument: true };
  }
  const items = (result.fields as { items?: TelegramItem[] }).items ?? [];

  if (items.length === 0) {
    await sendMessage(
      token,
      msg.chat.id,
      "Не понял, что это за документ (продажа/покупка машины или счёт на расход) — не буду ничего менять. Пришлите более чёткое фото или уточните."
    );
    return { hadDocument: true };
  }

  const isPdf = ref.mimeType === "application/pdf";

  const accepted: { it: TelegramItem; vin: string | null; buffer: Buffer }[] = [];
  const rejected: string[] = [];

  for (const it of items) {
    const pages = it.pages && it.pages.length > 0 ? it.pages : [1];
    const label = pages.length > 1 ? `стр. ${pages[0]}-${pages[pages.length - 1]}` : `стр. ${pages[0]}`;

    if (!it.role) {
      rejected.push(`${label}: не понял, что это за документ — пропущено.`);
      continue;
    }

    const vin = it.vin ? it.vin.trim().toUpperCase() : null;

    if (it.role === "SALE") {
      if (!vin) {
        rejected.push(`${label}: VIN не распознан — пропущено.`);
        continue;
      }
      if (!it.price) {
        rejected.push(`${label}: VIN ${vin} — цена продажи не распознана, пропущено.`);
        continue;
      }
      const car = await prisma.car.findUnique({ where: { vin } });
      if (!car) {
        rejected.push(`${label}: VIN ${vin} не найден в базе — пропущено.`);
        continue;
      }
    } else if (it.role === "PURCHASE") {
      if (!vin) {
        rejected.push(`${label}: VIN не распознан — пропущено.`);
        continue;
      }
      if (!it.make || !it.model || !it.price) {
        rejected.push(`${label}: VIN ${vin} — не хватает данных (марка/модель/цена), пропущено.`);
        continue;
      }
      const existing = await prisma.car.findUnique({ where: { vin } });
      if (existing) {
        rejected.push(`${label}: VIN ${vin} уже есть в базе (${existing.make} ${existing.model}) — пропущено.`);
        continue;
      }
    } else {
      // Платёжное уведомление (напр. Zahlungsinformation от Billie GmbH) — не настоящий счёт,
      // никогда не заносим как расход. См. lib/extractZulassung.ts.
      if (it.isRealInvoice === false) {
        rejected.push(`${label}: это платёжное уведомление, не настоящий счёт — пропущено.`);
        continue;
      }
      if (!it.amount) {
        rejected.push(`${label}: сумма не распознана — пропущено.`);
        continue;
      }
      const docDate = it.date ? new Date(it.date) : new Date();
      const existingTitle = await findExistingExpenseTitle(Math.round(it.amount * 100), docDate);
      if (existingTitle) {
        rejected.push(`${label}: похоже, уже есть в базе ("${existingTitle}", ${it.date}, ${it.amount} €) — пропущено.`);
        continue;
      }
    }

    let itemBuffer = buffer;
    if (isPdf) {
      try {
        itemBuffer = await slicePdfPages(buffer, pages);
      } catch {
        // не удалось вырезать страницы — сохраним весь файл целиком, лучше так, чем ничего
      }
    }

    accepted.push({ it: { ...it, vin }, vin, buffer: itemBuffer });
  }

  if (accepted.length === 0) {
    await sendMessage(
      token,
      msg.chat.id,
      `Ничего не удалось применить:\n${rejected.join("\n")}`
    );
    return { hadDocument: true };
  }

  const pending = await prisma.telegramPending.create({ data: { chatId: msg.chat.id } });
  await prisma.telegramPendingItem.createMany({
    data: accepted.map(({ it, buffer: b }) => ({
      pendingId: pending.id,
      role: it.role!,
      fieldsJson: JSON.stringify(it),
      fileBuffer: Uint8Array.from(b),
      fileMimeType: ref.mimeType,
      fileOriginalName: ref.name,
    })),
  });

  const lines = accepted.map(({ it, vin }, i) => summaryLineForItem(i + 1, it, vin));
  const text = [
    accepted.length > 1 ? `Найдено документов: ${accepted.length}. Проверьте данные:` : "Проверьте данные:",
    ``,
    ...lines,
    rejected.length > 0 ? `` : null,
    ...rejected,
    ``,
    `Всё верно?`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  await sendMessage(token, msg.chat.id, text, [
    { text: "✅ Подтвердить всё", callback_data: `tg_confirm:${pending.id}` },
    { text: "❌ Отмена", callback_data: `tg_cancel:${pending.id}` },
  ]);

  return { hadDocument: true };
}

export async function POST() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN не задан в .env — создайте бота через @BotFather и добавьте токен" },
      { status: 400 }
    );
  }

  let state = await prisma.telegramState.findFirst();
  if (!state) {
    state = await prisma.telegramState.create({ data: { lastUpdateId: 0 } });
  }

  let updates;
  try {
    updates = await getUpdates(token, state.lastUpdateId + 1);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  let documentsSeen = 0;
  let callbacksHandled = 0;
  const messages = updates.map((u) => u.message).filter((m): m is TelegramMessage => !!m);
  const callbacks = updates
    .map((u) => u.callback_query)
    .filter((c): c is TelegramCallbackQuery => !!c);

  const run = await prisma.checkRun.create({
    data: { kind: "TELEGRAM", summary: `Сообщений просмотрено: ${messages.length}`, itemsFound: 0 },
  });

  for (const msg of messages) {
    const { hadDocument } = await handleDocumentMessage(token, msg);
    if (hadDocument) documentsSeen++;
  }

  for (const cb of callbacks) {
    await handleCallback(token, cb);
    callbacksHandled++;
  }

  const newOffset = updates.length > 0 ? Math.max(...updates.map((u) => u.update_id)) + 1 : state.lastUpdateId;
  await prisma.telegramState.update({ where: { id: state.id }, data: { lastUpdateId: newOffset } });

  const summary = `Сообщений: ${messages.length}, документов: ${documentsSeen}, действий с кнопками: ${callbacksHandled}`;
  if (updates.length === 0) {
    // Боту ничего не писали — не засоряем историю проверок пустой записью.
    await prisma.checkRun.delete({ where: { id: run.id } });
  } else {
    await prisma.checkRun.update({ where: { id: run.id }, data: { summary, itemsFound: documentsSeen } });
  }

  return NextResponse.json({ itemsFound: documentsSeen, summary });
}
