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

export type InlineKeyboardButton = { text: string; callback_data: string };

function apiUrl(token: string, method: string): string {
  return `${API_ROOT}/bot${token}/${method}`;
}

/** timeout=0 — короткий опрос, вызывается по клику кнопки, не фоновый воркер. */
export async function getUpdates(token: string, offset: number): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams({ offset: String(offset), timeout: "0" });
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

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  buttons?: InlineKeyboardButton[]
): Promise<void> {
  await fetch(apiUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: buttons ? { inline_keyboard: [buttons] } : undefined,
    }),
  });
}

/** Убирает кнопки и заменяет текст исходного сообщения — вызывается после Подтвердить/Отмена. */
export async function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  await fetch(apiUrl(token, "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

/** Убирает "часики" у нажатой кнопки в клиенте Telegram. */
export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(apiUrl(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/** Лучшее (последнее по размеру) фото из photo[] — Telegram отдаёт от меньшего к большему. */
export function bestPhoto(photo: TelegramPhotoSize[]): TelegramPhotoSize {
  return photo[photo.length - 1];
}
