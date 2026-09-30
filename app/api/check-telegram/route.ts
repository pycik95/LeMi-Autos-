import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUpdates, type TelegramCallbackQuery, type TelegramMessage } from "@/lib/telegram";
import { handleCallback, handleMessage, sweep } from "@/lib/bot/handlers";

// Все сообщения и нажатия кнопок обрабатываются последовательно и только одним опросом за раз
// (иначе бот пришлёт две карточки на один документ). Логика бота — в lib/bot/.
const lock = globalThis as unknown as { __telegramCheckRunning?: boolean; __telegramLastSweep?: number };
const SWEEP_EVERY_MS = 60_000;

export async function POST(req: Request) {
  const waitSec = Math.min(Math.max(Number(new URL(req.url).searchParams.get("wait")) || 0, 0), 50);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN не задан в .env — создайте бота через @BotFather и добавьте токен" },
      { status: 400 }
    );
  }
  if (lock.__telegramCheckRunning) {
    return NextResponse.json({ itemsFound: 0, summary: "Бот уже слушает Telegram в реальном времени — новые сообщения обрабатываются сами" });
  }
  lock.__telegramCheckRunning = true;
  try {
    return await runCheck(token, waitSec);
  } finally {
    lock.__telegramCheckRunning = false;
  }
}

async function runCheck(token: string, waitSec: number) {
  let state = await prisma.telegramState.findFirst();
  if (!state) state = await prisma.telegramState.create({ data: { lastUpdateId: 0 } });

  let updates;
  try {
    updates = await getUpdates(token, state.lastUpdateId + 1, waitSec);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // Раз в минуту: карточки без сообщения (перенос из старой версии) и продажи, дождавшиеся карточки машины.
  if (Date.now() - (lock.__telegramLastSweep ?? 0) >= SWEEP_EVERY_MS) {
    lock.__telegramLastSweep = Date.now();
    try {
      await sweep(token);
    } catch (err) {
      console.error("[telegram-sweep]", err instanceof Error ? err.message : err);
    }
  }

  if (updates.length === 0) return NextResponse.json({ itemsFound: 0, summary: "Новых сообщений нет" });

  const messages = updates.map((u) => u.message).filter((m): m is TelegramMessage => !!m);
  const callbacks = updates.map((u) => u.callback_query).filter((c): c is TelegramCallbackQuery => !!c);

  const run = await prisma.checkRun.create({
    data: { kind: "TELEGRAM", summary: `Сообщений просмотрено: ${messages.length}`, itemsFound: 0 },
  });

  // Смещение сдвигаем после каждого обновления: если обработка упадёт на одном сообщении,
  // остальные не будут прочитаны повторно и не пришлют дублей карточек.
  let documentsSeen = 0;
  let failures = 0;
  const ordered = [...updates].sort((a, b) => a.update_id - b.update_id);
  for (const u of ordered) {
    try {
      if (u.message) {
        const { hadDocument } = await handleMessage(token, u.message);
        if (hadDocument) documentsSeen++;
      } else if (u.callback_query) {
        await handleCallback(token, u.callback_query);
      }
    } catch (err) {
      failures++;
      console.error("[telegram] обработка обновления", u.update_id, err);
    }
    await prisma.telegramState.update({ where: { id: state.id }, data: { lastUpdateId: u.update_id } });
  }

  const summary = `Сообщений: ${messages.length}, документов: ${documentsSeen}, действий с кнопками: ${callbacks.length}${failures ? `, сбоев: ${failures}` : ""}`;
  await prisma.checkRun.update({ where: { id: run.id }, data: { summary, itemsFound: documentsSeen } });
  return NextResponse.json({ itemsFound: documentsSeen, summary });
}
