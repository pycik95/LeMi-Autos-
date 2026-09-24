// Одноразовый вход в аккаунт аукциона (CarOnSale / AUTO1) — открывает видимое окно браузера,
// ждёт, пока пользователь сам залогинится, затем сохраняет сессию (только куки) в .auth/{site}.json.
// Пароль сюда никогда не попадает и не читается скриптом.
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const SITES = {
  cos: {
    label: "CarOnSale",
    url: "https://app.caronsale.de/salesman/checkout",
  },
  auto1: {
    label: "AUTO1",
    url: "https://www.auto1.com/ru/app/inventory/my-orders/all/1",
  },
};

const key = process.argv[2];
const site = SITES[key];
if (!site) {
  console.error(`Использование: node scripts/auction-login.mjs <cos|auto1>`);
  process.exit(1);
}

const authDir = path.join(process.cwd(), ".auth");
fs.mkdirSync(authDir, { recursive: true });
const statePath = path.join(authDir, `${key}.json`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(site.url);

console.log(`Открыто окно ${site.label}. Войдите в аккаунт как обычно.`);
console.log("Жду до 10 минут, пока не увижу, что вы залогинены...");

const deadlineMs = Date.now() + 10 * 60 * 1000;
let loggedIn = false;
while (Date.now() < deadlineMs) {
  await page.waitForTimeout(3000);
  const hasPasswordField = await page.locator('input[type="password"]').count();
  const url = page.url().toLowerCase();
  const looksLikeLogin = /login|signin|auth|sso/.test(url);
  if (hasPasswordField === 0 && !looksLikeLogin) {
    loggedIn = true;
    break;
  }
}

if (!loggedIn) {
  console.error("Не дождалась входа за 10 минут — сессия НЕ сохранена. Запустите скрипт заново.");
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: statePath });
await browser.close();
console.log(`Сессия ${site.label} сохранена в ${statePath}`);
