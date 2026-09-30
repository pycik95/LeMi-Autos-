// Тонкая обёртка над Telegram Bot API — только транспорт, никакой бизнес-логики (она в lib/bot/).
const API_ROOT = "https://api.telegram.org";

export type TelegramPhotoSize = {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
};

export type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  date: number;
  text?: string;
  reply_to_message?: { message_id: number };
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: { message_id: number; chat: { id: number } };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type Button = { text: string; callback_data: string };
/** Ряды inline-кнопок под сообщением. */
export type Rows = Button[][];

function apiUrl(token: string, method: string): string {
  return `${API_ROOT}/bot${token}/${method}`;
}

/** Вызов метода Bot API. Возвращает result либо null (ошибка логируется, но не бросается — один сбой не должен ронять обработку пачки). */
async function call<T>(token: string, method: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(token, method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      // "message is not modified" — нормальная ситуация при повторной перерисовке той же карточки
      if (!String(data?.description ?? "").includes("not modified")) {
        console.error(`[telegram] ${method}:`, data?.description ?? res.status);
      }
      return null;
    }
    return data.result as T;
  } catch (err) {
    console.error(`[telegram] ${method}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** waitSec=0 — короткий опрос; waitSec>0 — длинный: Telegram держит запрос и отвечает сразу, как придёт событие. */
export async function getUpdates(token: string, offset: number, waitSec = 0): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams({ offset: String(offset), timeout: String(waitSec) });
  const res = await fetch(`${apiUrl(token, "getUpdates")}?${params.toString()}`);
  if (!res.ok) throw new Error(`Telegram getUpdates failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);
  return data.result as TelegramUpdate[];
}

async function getFilePath(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${apiUrl(token, "getFile")}?file_id=${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(`Telegram getFile failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${JSON.stringify(data)}`);
  }
  return data.result.file_path as string;
}

export async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const filePath = await getFilePath(token, fileId);
  const res = await fetch(`${API_ROOT}/file/bot${token}/${filePath}`);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Возвращает message_id отправленного сообщения. */
export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  opts: { rows?: Rows; replyTo?: number; replyMarkup?: unknown } = {}
): Promise<number | null> {
  const result = await call<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_to_message_id: opts.replyTo,
    allow_sending_without_reply: true,
    reply_markup: opts.replyMarkup ?? (opts.rows ? { inline_keyboard: opts.rows } : undefined),
  });
  return result?.message_id ?? null;
}

/** Отправляет файл с подписью и кнопками — «карточка документа». Возвращает message_id. */
export async function sendDocument(
  token: string,
  chatId: number,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption: string,
  rows?: Rows
): Promise<number | null> {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    if (rows) form.append("reply_markup", JSON.stringify({ inline_keyboard: rows }));
    form.append("document", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
    const res = await fetch(apiUrl(token, "sendDocument"), { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      console.error("[telegram] sendDocument:", data?.description ?? res.status);
      return null;
    }
    return data.result.message_id as number;
  } catch (err) {
    console.error("[telegram] sendDocument:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Меняет подпись файла-карточки и её кнопки (rows=[] — убрать кнопки). */
export async function editCaption(
  token: string,
  chatId: number,
  messageId: number,
  caption: string,
  rows: Rows = []
): Promise<boolean> {
  const r = await call(token, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    reply_markup: { inline_keyboard: rows },
  });
  return r !== null;
}

/** Меняет текст обычного сообщения и его кнопки. */
export async function editText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  rows: Rows = []
): Promise<boolean> {
  const r = await call(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: { inline_keyboard: rows },
  });
  return r !== null;
}

/** Убирает кнопки у старого сообщения (когда карточка отправлена заново). */
export async function clearButtons(token: string, chatId: number, messageId: number): Promise<void> {
  await call(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

/** Убирает "часики" у нажатой кнопки в клиенте Telegram. */
export async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
  await call(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

/** Лучшее (последнее по размеру) фото из photo[] — Telegram отдаёт от меньшего к большему. */
export function bestPhoto(photo: TelegramPhotoSize[]): TelegramPhotoSize {
  return photo[photo.length - 1];
}
