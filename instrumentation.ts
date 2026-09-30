// Бот работает в режиме длинного опроса: запрос к Telegram висит до 25 секунд и возвращается сразу,
// как приходит документ или нажатие кнопки — ответ бота занимает около секунды. Пока сервер выключен,
// бот молчит, но Telegram хранит необработанное 24 часа — всё подхватится при следующем запуске.
// Сохраняется всё так же только после подтверждения кнопкой в Telegram.
const WAIT_SEC = 25;

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.TELEGRAM_BOT_TOKEN) return;

  const g = globalThis as unknown as { __telegramPoller?: boolean };
  if (g.__telegramPoller) return;
  g.__telegramPoller = true;

  const url = `http://localhost:${process.env.PORT || 3000}/api/check-telegram?wait=${WAIT_SEC}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const loop = async () => {
    await sleep(15_000); // дать серверу подняться
    for (;;) {
      try {
        const res = await fetch(url, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[telegram-poll]", data.error ?? res.status);
          await sleep(10_000);
        } else if (data.itemsFound > 0) {
          console.log("[telegram-poll]", data.summary);
        } else if (String(data.summary ?? "").startsWith("Бот уже слушает")) {
          await sleep(WAIT_SEC * 1000); // параллельный опрос уже идёт (напр. кнопка) — не дублируем
        }
      } catch (err) {
        console.error("[telegram-poll]", err instanceof Error ? err.message : err);
        await sleep(10_000);
      }
    }
  };

  console.log("[telegram-poll] бот слушает Telegram в реальном времени (длинный опрос)");
  void loop();
}
