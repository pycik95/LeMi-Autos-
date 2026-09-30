import { PDFDocument } from "pdf-lib";
import type { TelegramDoc } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyTelegramCorrection, extractTelegramBatchFields } from "@/lib/extractZulassung";
import {
  answerCallbackQuery,
  bestPhoto,
  clearButtons,
  downloadFile,
  editCaption,
  sendMessage,
  type Rows,
  type TelegramCallbackQuery,
  type TelegramMessage,
} from "@/lib/telegram";
import { applyDoc } from "./apply";
import { docSummary, refreshCard, resendCard, roleLabel, sendCard } from "./cards";
import { normVin, parseFields, type DocFields } from "./shared";
import { judge, type Verdict } from "./verdict";

// ───────────────────────── постоянное меню ─────────────────────────

const MENU_PENDING = "📋 Ждут подтверждения";
const MENU_HANGING = "⏳ Подвешенные";
const MENU_SUMMARY = "📊 Сводка";
const MENU_MARKUP = {
  keyboard: [[{ text: MENU_PENDING }, { text: MENU_HANGING }], [{ text: MENU_SUMMARY }]],
  resize_keyboard: true,
  is_persistent: true,
};

/** Показывает постоянную клавиатуру-меню в чате один раз (запоминаем в базе, force — показать снова). */
export async function ensureMenu(token: string, chatId: number, force = false): Promise<void> {
  let state = await prisma.telegramState.findFirst();
  if (!state) state = await prisma.telegramState.create({ data: { lastUpdateId: 0 } });
  const ids = state.menuChatIds.split(",").filter(Boolean);
  if (!force && ids.includes(String(chatId))) return;
  await sendMessage(
    token,
    chatId,
    "Меню внизу всегда под рукой 👇\n\nПришлите договор или чек — я распознаю его и покажу карточку. В базу попадёт только то, что вы подтвердите.",
    { replyMarkup: MENU_MARKUP }
  );
  if (!ids.includes(String(chatId))) {
    await prisma.telegramState.update({ where: { id: state.id }, data: { menuChatIds: [...ids, String(chatId)].join(",") } });
  }
}

// ───────────────────────── приём файлов ─────────────────────────

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
  return Buffer.from(await out.save());
}

function statusFromVerdict(v: Verdict): { status: "PENDING" | "HANGING"; code: string | null; reason: string | null } {
  if (v.kind === "ok") return { status: "PENDING", code: null, reason: null };
  if (v.kind === "hang") return { status: "HANGING", code: v.code, reason: v.reason };
  return { status: "HANGING", code: "HELD", reason: v.reason };
}

/** Целый файл, который не удалось разобрать на документы, — подвешиваем как есть, чтобы он не потерялся. */
async function hangWholeFile(token: string, chatId: number, buffer: Buffer, mime: string, name: string, reason: string) {
  const doc = await prisma.telegramDoc.create({
    data: {
      chatId,
      status: "HANGING",
      code: "UNREADABLE",
      reason,
      role: null,
      fieldsJson: "{}",
      fileBuffer: Uint8Array.from(buffer),
      fileMimeType: mime,
      fileName: name,
    },
  });
  await sendCard(token, doc);
}

/** Скачанный файл → документы → карточки. Общий путь и для новых файлов, и для «Проверить снова». */
export async function processFile(token: string, chatId: number, buffer: Buffer, mime: string, name: string) {
  const result = await extractTelegramBatchFields(buffer, mime);
  if (!result.ok) {
    await hangWholeFile(token, chatId, buffer, mime, name, `не удалось распознать файл: ${result.error}`);
    return;
  }
  const items = (result.fields as { items?: DocFields[] }).items ?? [];
  if (items.length === 0) {
    await hangWholeFile(token, chatId, buffer, mime, name, "в файле не найдено ни одного документа (нечитаемо или не по теме)");
    return;
  }

  const isPdf = mime === "application/pdf";
  const skipped: string[] = [];
  const created: TelegramDoc[] = [];

  for (const it of items) {
    const pages = it.pages && it.pages.length > 0 ? it.pages : [1];
    const label =
      isPdf && (items.length > 1 || pages.length > 1)
        ? pages.length > 1
          ? `стр. ${pages[0]}-${pages[pages.length - 1]}`
          : `стр. ${pages[0]}`
        : null;

    const fields: DocFields = { ...it, vin: normVin(it.vin) };
    const verdict = await judge(fields);
    if (verdict.kind === "skip") {
      skipped.push(`• ${label ? `${label}: ` : ""}${docSummary(fields)} — ${verdict.reason}`);
      continue;
    }

    let docBuffer = buffer;
    if (isPdf) {
      try {
        docBuffer = await slicePdfPages(buffer, pages);
      } catch {
        // не удалось вырезать страницы — сохраним весь файл целиком, лучше так, чем ничего
      }
    }

    created.push(
      await prisma.telegramDoc.create({
        data: {
          chatId,
          ...statusFromVerdict(verdict),
          role: fields.role ?? null,
          fieldsJson: JSON.stringify(fields),
          fileBuffer: Uint8Array.from(docBuffer),
          fileMimeType: mime,
          fileName: name,
          pageLabel: label,
        },
      })
    );
  }

  for (const doc of created) await sendCard(token, doc);

  if (skipped.length > 0) {
    await sendMessage(token, chatId, [`Из «${name}» пропущено (не нужно вносить):`, ...skipped].join("\n"));
  }
  const pendingNow = await prisma.telegramDoc.count({ where: { chatId, status: "PENDING" } });
  if (created.filter((d) => d.status === "PENDING").length > 1) {
    await sendMessage(token, chatId, `Из «${name}» готово к подтверждению: ${created.filter((d) => d.status === "PENDING").length}.`, {
      rows: [[{ text: `✅ Подтвердить все ожидающие (${pendingNow})`, callback_data: "ca:all" }]],
    });
  }
}

// ───────────────────────── подтверждение / состояния ─────────────────────────

/** Обновляет запись по свежему вердикту и перерисовывает её карточку. Возвращает вердикт. */
async function reevaluate(token: string, doc: TelegramDoc, fields: DocFields): Promise<{ doc: TelegramDoc; verdict: Verdict }> {
  const verdict = await judge(fields);
  const updated = await prisma.telegramDoc.update({
    where: { id: doc.id },
    data: { ...statusFromVerdict(verdict), role: fields.role ?? null, fieldsJson: JSON.stringify(fields) },
  });
  await refreshCard(token, updated);
  return { doc: updated, verdict };
}

const DONE_ROW: Rows = [[{ text: "✅ Подтверждено", callback_data: "noop" }]];

/** Применяет документ к базе. Возвращает текст результата, либо null если документ оказался непроходящим (карточка перерисована). */
async function confirmDoc(token: string, doc: TelegramDoc): Promise<string | null> {
  const fields = parseFields(doc.fieldsJson);
  // Между показом карточки и нажатием кнопки мир мог измениться — проверяем заново.
  const verdict = await judge(fields);
  if (verdict.kind === "skip") {
    await prisma.telegramDoc.delete({ where: { id: doc.id } });
    if (doc.cardMessageId) {
      await editCaption(token, doc.chatId, doc.cardMessageId, `⏭ Пропущено: ${verdict.reason}\n${docSummary(fields)}`, [[{ text: "⏭ Пропущено", callback_data: "noop" }]]);
    }
    return `Пропущено: ${verdict.reason}`;
  }
  if (verdict.kind === "hang") {
    await reevaluate(token, doc, fields);
    return null;
  }

  let result: string;
  try {
    result = await applyDoc(fields, doc.fileName, doc.fileMimeType, Buffer.from(doc.fileBuffer));
  } catch (err) {
    // Документ остаётся у бота — можно нажать ещё раз.
    return `Ошибка при сохранении: ${err instanceof Error ? err.message : err}`;
  }
  await prisma.telegramDoc.delete({ where: { id: doc.id } });
  if (doc.cardMessageId) {
    await editCaption(token, doc.chatId, doc.cardMessageId, `✅ Подтверждено\n${roleLabel(doc.role)} · ${docSummary(fields)}\n\n${result}`, DONE_ROW);
  }
  return result;
}

/**
 * Продажи, ждавшие карточку машины: как только карточка появилась (подтверждена покупка, проверен
 * аукцион, добавлена вручную) — переводим в «ждёт подтверждения» и сообщаем. Сам факт продажи
 * по-прежнему записывается только после «Подтвердить».
 */
export async function wakeHangingSales(token: string): Promise<number> {
  const docs = await prisma.telegramDoc.findMany({ where: { status: "HANGING", code: "NO_CAR", role: "SALE" } });
  let woke = 0;
  for (const doc of docs) {
    const fields = parseFields(doc.fieldsJson);
    const verdict = await judge(fields);
    if (verdict.kind !== "ok") continue;
    const updated = await prisma.telegramDoc.update({
      where: { id: doc.id },
      data: { status: "PENDING", code: null, reason: null },
    });
    await sendMessage(token, doc.chatId, `🔔 Появилась карточка машины ${normVin(fields.vin)} — договор продажи снова готов к подтверждению 👇`);
    await resendCard(token, updated);
    woke++;
  }
  return woke;
}

/** Периодическая уборка: присылает карточки, у которых ещё нет сообщения (напр. перенесённые из старой версии), и будит продажи. */
export async function sweep(token: string): Promise<void> {
  const unsent = await prisma.telegramDoc.findMany({ where: { cardMessageId: null }, orderBy: { createdAt: "asc" } });
  if (unsent.length > 0) {
    const chats = [...new Set(unsent.map((d) => d.chatId))];
    for (const chatId of chats) {
      await ensureMenu(token, chatId);
      await sendMessage(token, chatId, `Бот обновлён. Ваши документы, не обработанные ранее (${unsent.filter((d) => d.chatId === chatId).length}), приходят ниже как карточки с файлами.`);
    }
    for (const doc of unsent) await sendCard(token, doc);
  }
  await wakeHangingSales(token);
}

// ───────────────────────── списки и сводка ─────────────────────────

const LIST_CARDS_LIMIT = 10;

function docLine(n: number, d: TelegramDoc): string {
  const f = parseFields(d.fieldsJson);
  const src = `${d.fileName}${d.pageLabel ? ` ${d.pageLabel}` : ""}`;
  return `${n}. ${roleLabel(d.role)} · ${docSummary(f)}${d.status === "HANGING" && d.reason ? `\n   ⚠️ ${d.reason}` : ""}\n   📎 ${src}`;
}

async function showList(token: string, chatId: number, status: "PENDING" | "HANGING") {
  const docs = await prisma.telegramDoc.findMany({ where: { chatId, status }, orderBy: { createdAt: "asc" } });
  if (docs.length === 0) {
    await sendMessage(token, chatId, status === "PENDING" ? "Нет документов, ждущих подтверждения ✅" : "Подвешенных документов нет ✅");
    return;
  }
  const head = status === "PENDING" ? `📋 Ждут подтверждения: ${docs.length}` : `⏳ Подвешено: ${docs.length}`;
  const shown = docs.slice(0, LIST_CARDS_LIMIT);
  const text = [head, "", ...docs.slice(0, 30).map((d, i) => docLine(i + 1, d))].join("\n").slice(0, 3900);
  const rows: Rows =
    status === "PENDING"
      ? [[{ text: `✅ Подтвердить все (${docs.length})`, callback_data: "ca:all" }]]
      : [[{ text: "🔄 Проверить все снова", callback_data: "ra:all" }]];
  await sendMessage(token, chatId, text, { rows });
  if (docs.length > shown.length) {
    await sendMessage(token, chatId, `Ниже карточки первых ${shown.length} — остальные покажу после обработки этих.`);
  }
  for (const d of shown) await resendCard(token, d);
}

async function showSummary(token: string, chatId: number) {
  const [pending, hanging, noCar, cars, exp, gexp] = await Promise.all([
    prisma.telegramDoc.count({ where: { chatId, status: "PENDING" } }),
    prisma.telegramDoc.count({ where: { chatId, status: "HANGING" } }),
    prisma.telegramDoc.count({ where: { chatId, status: "HANGING", code: "NO_CAR" } }),
    prisma.car.count({ where: { checkRunId: { not: null } } }),
    prisma.expense.count({ where: { checkRunId: { not: null } } }),
    prisma.generalExpense.count({ where: { checkRunId: { not: null } } }),
  ]);
  await sendMessage(
    token,
    chatId,
    [
      "📊 Сводка",
      `• Ждут подтверждения в боте: ${pending}`,
      `• Подвешено: ${hanging}${noCar ? ` (из них ждут карточки машины: ${noCar})` : ""}`,
      `• На странице /check ждут подтверждения: машин ${cars}, расходов ${exp + gexp}`,
    ].join("\n")
  );
}

// ───────────────────────── кнопки ─────────────────────────

/** id сообщений-подсказок «напишите правку» → документ, чтобы reply на подсказку тоже находил карточку. */
const g = globalThis as unknown as { __botEditPrompts?: Map<string, string> };
const editPrompts = (g.__botEditPrompts ??= new Map<string, string>());

export async function handleCallback(token: string, cb: TelegramCallbackQuery) {
  const [action, id, extra] = (cb.data ?? "").split(":");
  const chatId = cb.message?.chat.id;
  if (!chatId) return answerCallbackQuery(token, cb.id);

  if (action === "noop") return answerCallbackQuery(token, cb.id);

  if (action === "ca") {
    await answerCallbackQuery(token, cb.id, "Подтверждаю…");
    const docs = await prisma.telegramDoc.findMany({ where: { chatId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (docs.length === 0) return void (await sendMessage(token, chatId, "Нет документов, ждущих подтверждения ✅"));
    const okLines: string[] = [];
    const bad: string[] = [];
    for (const d of docs) {
      const r = await confirmDoc(token, d);
      if (r === null) bad.push(`• ${docSummary(parseFields(d.fieldsJson))} — перенесено в подвешенные`);
      else if (r.startsWith("Ошибка")) bad.push(`• ${docSummary(parseFields(d.fieldsJson))} — ${r}`);
      else okLines.push(`• ${r}`);
    }
    await wakeHangingSales(token);
    await sendMessage(token, chatId, [`Готово: ${okLines.length} из ${docs.length}.`, ...okLines, ...(bad.length ? ["", "Не прошли:", ...bad] : [])].join("\n").slice(0, 3900));
    return;
  }

  if (action === "ra") {
    await answerCallbackQuery(token, cb.id, "Проверяю…");
    const docs = await prisma.telegramDoc.findMany({ where: { chatId, status: "HANGING", NOT: { code: "UNREADABLE" } } });
    let ready = 0;
    for (const d of docs) {
      const { verdict } = await reevaluate(token, d, parseFields(d.fieldsJson));
      if (verdict.kind === "ok") ready++;
    }
    await sendMessage(token, chatId, `Проверено: ${docs.length}. Теперь готово к подтверждению: ${ready}, всё ещё подвешено: ${docs.length - ready}.`);
    return;
  }

  const doc = id ? await prisma.telegramDoc.findUnique({ where: { id } }) : null;
  if (!doc) {
    // Кнопки из старой версии бота или уже обработанный документ.
    await answerCallbackQuery(token, cb.id, "Уже обработано или кнопка устарела — откройте меню «Ждут подтверждения»");
    return;
  }

  switch (action) {
    case "c": {
      if (doc.status !== "PENDING") return answerCallbackQuery(token, cb.id, "Документ подвешен — сначала исправьте");
      await answerCallbackQuery(token, cb.id, "Сохраняю…");
      const r = await confirmDoc(token, doc);
      if (r === null) await sendMessage(token, doc.chatId, "Документ больше не проходит проверку — перенесён в подвешенные, причина в его карточке.", { replyTo: doc.cardMessageId ?? undefined });
      else if (r.startsWith("Ошибка")) await sendMessage(token, doc.chatId, r, { replyTo: doc.cardMessageId ?? undefined });
      await wakeHangingSales(token);
      return;
    }
    case "x": {
      await prisma.telegramDoc.delete({ where: { id: doc.id } });
      if (doc.cardMessageId) {
        await editCaption(token, doc.chatId, doc.cardMessageId, `🗑 Удалено\n${roleLabel(doc.role)} · ${docSummary(parseFields(doc.fieldsJson))}`, [[{ text: "🗑 Удалено", callback_data: "noop" }]]);
      }
      return answerCallbackQuery(token, cb.id, "Удалено");
    }
    case "h": {
      const updated = await prisma.telegramDoc.update({ where: { id: doc.id }, data: { status: "HANGING", code: "HELD", reason: "отложено вручную" } });
      await refreshCard(token, updated);
      return answerCallbackQuery(token, cb.id, "Отложено");
    }
    case "e": {
      await answerCallbackQuery(token, cb.id);
      const promptId = await sendMessage(
        token,
        doc.chatId,
        "✏️ Напишите правку ответом на это сообщение — например: «цена 800, а не 8000» или «VIN такой-то, покупатель такой-то». Что не хватает — допишите.",
        { replyTo: doc.cardMessageId ?? undefined }
      );
      if (promptId) editPrompts.set(`${doc.chatId}:${promptId}`, doc.id);
      return;
    }
    case "r": {
      if (doc.code === "UNREADABLE") {
        await answerCallbackQuery(token, cb.id, "Распознаю заново…");
        await prisma.telegramDoc.delete({ where: { id: doc.id } });
        if (doc.cardMessageId) await clearButtons(token, doc.chatId, doc.cardMessageId);
        await processFile(token, doc.chatId, Buffer.from(doc.fileBuffer), doc.fileMimeType, doc.fileName);
        return;
      }
      const { verdict } = await reevaluate(token, doc, parseFields(doc.fieldsJson));
      return answerCallbackQuery(token, cb.id, verdict.kind === "ok" ? "Теперь всё в порядке — можно подтверждать" : "Всё ещё не проходит");
    }
    case "n": {
      const fields = parseFields(doc.fieldsJson);
      await reevaluate(token, doc, { ...fields, forceNew: true });
      return answerCallbackQuery(token, cb.id, "Создам как новую машину — проверьте и подтвердите");
    }
    case "s": {
      const car = extra ? await prisma.car.findUnique({ where: { id: extra } }) : null;
      if (!car?.vin) return answerCallbackQuery(token, cb.id, "Машина не найдена");
      const fields = parseFields(doc.fieldsJson);
      const fixed: DocFields = { ...fields, vinReadAs: normVin(fields.vin), vin: normVin(car.vin) };
      await reevaluate(token, doc, fixed);
      return answerCallbackQuery(token, cb.id, "VIN заменён — проверьте и подтвердите");
    }
    default:
      return answerCallbackQuery(token, cb.id);
  }
}

// ───────────────────────── сообщения ─────────────────────────

/** Правка текстом: находим документ (reply на карточку → VIN в тексте → единственный открытый) и просим модель поправить поля. */
async function handleCorrection(token: string, msg: TelegramMessage, text: string) {
  const chatId = msg.chat.id;
  let target: TelegramDoc | null = null;

  const replyId = msg.reply_to_message?.message_id;
  if (replyId) {
    const promptDocId = editPrompts.get(`${chatId}:${replyId}`);
    target = promptDocId
      ? await prisma.telegramDoc.findUnique({ where: { id: promptDocId } })
      : await prisma.telegramDoc.findFirst({ where: { chatId, cardMessageId: replyId } });
  }

  const open = await prisma.telegramDoc.findMany({ where: { chatId }, orderBy: { createdAt: "desc" } });
  if (!target) {
    const vinInText = text.toUpperCase().match(/[A-Z0-9]{17}/)?.[0];
    if (vinInText) target = open.find((d) => normVin(parseFields(d.fieldsJson).vin) === vinInText) ?? null;
    if (!target && open.length === 1) target = open[0];
  }

  if (!target) {
    await sendMessage(
      token,
      chatId,
      open.length === 0
        ? "Сейчас нет документов, которые можно поправить. Пришлите договор или чек."
        : "Не понял, к какому документу правка. Ответьте (reply) на нужную карточку или напишите VIN и что исправить, например: «WVWZZZ9NZ9Y186911 цена 800, а не 8000»."
    );
    return;
  }

  const fix = await applyTelegramCorrection(target.fieldsJson, text);
  if (!fix.ok) {
    await sendMessage(token, chatId, `Не удалось применить правку: ${fix.error}`, { replyTo: target.cardMessageId ?? undefined });
    return;
  }
  const old = parseFields(target.fieldsJson);
  const corrected = { ...old, ...(fix.fields as DocFields) };
  corrected.vin = normVin(corrected.vin);
  const { verdict } = await reevaluate(token, target, corrected);
  await sendMessage(
    token,
    chatId,
    verdict.kind === "ok" ? "✏️ Поправил — карточка выше обновлена, можно подтверждать." : `✏️ Поправил, но документ всё ещё подвешен: ${verdict.kind === "hang" ? verdict.reason : verdict.reason}`,
    { replyTo: target.cardMessageId ?? undefined }
  );
  // Правка могла создать карточку машины (не сама по себе, но продажи могли ждать) — проверяем.
  await wakeHangingSales(token);
}

export async function handleMessage(token: string, msg: TelegramMessage): Promise<{ hadDocument: boolean }> {
  const chatId = msg.chat.id;
  await ensureMenu(token, chatId);

  const ref = fileRefFromMessage(msg);
  if (ref) {
    let buffer: Buffer;
    try {
      buffer = await downloadFile(token, ref.fileId);
    } catch (err) {
      await sendMessage(token, chatId, `Не удалось скачать файл «${ref.name}»: ${err instanceof Error ? err.message : err}. Пришлите его ещё раз.`);
      return { hadDocument: true };
    }
    await processFile(token, chatId, buffer, ref.mimeType, ref.name);
    return { hadDocument: true };
  }

  const text = (msg.text ?? "").trim();
  if (!text) return { hadDocument: false };

  if (text === MENU_PENDING || /^\/(pending|list)\b/i.test(text)) await showList(token, chatId, "PENDING");
  else if (text === MENU_HANGING || /^\/(hanging|issues)\b/i.test(text) || /^список$/i.test(text)) await showList(token, chatId, "HANGING");
  else if (text === MENU_SUMMARY || /^\/(summary|status)\b/i.test(text)) await showSummary(token, chatId);
  else if (/^\/(start|menu)\b/i.test(text)) await ensureMenu(token, chatId, true);
  else if (text.startsWith("/")) await sendMessage(token, chatId, "Команды: /pending — ждут подтверждения, /hanging — подвешенные, /summary — сводка, /menu — показать меню.");
  else {
    try {
      await handleCorrection(token, msg, text);
    } catch (err) {
      await sendMessage(token, chatId, `Не удалось обработать сообщение: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { hadDocument: false };
}
