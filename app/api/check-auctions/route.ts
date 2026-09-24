import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { extractAuctionLots } from "@/lib/extractZulassung";

type SiteKey = "cos" | "auto1";

const SITES: Record<SiteKey, { label: string; url: string; source: "CAR_ON_SALE" | "AUTO1" }> = {
  cos: { label: "CarOnSale", url: "https://app.caronsale.de/salesman/checkout", source: "CAR_ON_SALE" },
  auto1: { label: "AUTO1", url: "https://www.auto1.com/ru/app/inventory/my-orders/all/1", source: "AUTO1" },
};

type Lot = {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  lotNumber?: string | null;
  price?: number | null;
  date?: string | null;
  mileageKm?: number | null;
};

/**
 * Кнопка "Проверить аукционы" — читает страницу "мои закупки" CarOnSale/AUTO1 через сохранённую
 * сессию (.auth/{site}.json, см. scripts/auction-login.mjs — пароль сюда никогда не попадает),
 * достаёт список выигранных лотов моделью и заводит НЕПОЛНЫЕ карточки новых машин (только VIN/цена/
 * лот, остальное придёт со счётом на почту) с checkRunId — они ждут подтверждения на /check,
 * как и всё остальное, найденное автопроверкой (см. app/api/check-mail/route.ts).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sites: SiteKey[] = Array.isArray(body.sites)
    ? body.sites.filter((s: string): s is SiteKey => s === "cos" || s === "auto1")
    : [];
  if (sites.length === 0) {
    return NextResponse.json({ error: "Не выбран ни один аукцион" }, { status: 400 });
  }

  const authDir = path.join(process.cwd(), ".auth");
  const perSite: Record<string, { status: string; lotsFound: number; newCars: number }> = {};
  const createdCars: { id: string; vin: string; make: string; model: string }[] = [];

  const run = await prisma.checkRun.create({
    data: { kind: "AUCTION", summary: "Проверка в процессе…", itemsFound: 0 },
  });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const key of sites) {
      const site = SITES[key];
      const statePath = path.join(authDir, `${key}.json`);
      if (!fs.existsSync(statePath)) {
        perSite[key] = { status: "нужен вход — запустите: node scripts/auction-login.mjs " + key, lotsFound: 0, newCars: 0 };
        continue;
      }

      const context = await browser.newContext({ storageState: statePath });
      const page = await context.newPage();
      try {
        await page.goto(site.url, { waitUntil: "networkidle", timeout: 30000 });
        const hasPasswordField = await page.locator('input[type="password"]').count();
        if (hasPasswordField > 0) {
          perSite[key] = { status: "сессия истекла — перелогиньтесь: node scripts/auction-login.mjs " + key, lotsFound: 0, newCars: 0 };
          continue;
        }

        const pageText = await page.innerText("body");
        const result = await extractAuctionLots(pageText, site.label);
        if (!result.ok) {
          perSite[key] = { status: `ошибка распознавания: ${result.error}`, lotsFound: 0, newCars: 0 };
          continue;
        }

        const lots = ((result.fields as { lots?: Lot[] })?.lots ?? []).filter((l) => l && l.vin);
        let newCars = 0;
        for (const lot of lots) {
          const vin = String(lot.vin).trim().toUpperCase();
          const existing = await prisma.car.findUnique({ where: { vin } });
          if (existing) continue;

          const car = await prisma.car.create({
            data: {
              vin,
              make: lot.make || "?",
              model: lot.model || "?",
              mileageKm: lot.mileageKm ? Math.round(lot.mileageKm) : null,
              purchasePriceCents: lot.price != null ? Math.round(lot.price * 100) : null,
              lotNumber: lot.lotNumber || null,
              source: site.source,
              invoiceDate: lot.date ? new Date(lot.date) : null,
              status: "IN_STOCK",
              notes: `Найдено автопроверкой аукциона (${site.label}) — данные неполные (только то, что видно на странице закупок), дождитесь счёта на почту для деталей и документа.`,
              checkRunId: run.id,
            },
          });
          createdCars.push({ id: car.id, vin: car.vin, make: car.make, model: car.model });
          newCars++;
        }
        perSite[key] = { status: "ok", lotsFound: lots.length, newCars };
      } catch (err) {
        perSite[key] = {
          status: `ошибка: ${err instanceof Error ? err.message : String(err)}`,
          lotsFound: 0,
          newCars: 0,
        };
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = sites
    .map((k) => `${SITES[k].label}: ${perSite[k].status === "ok" ? `лотов ${perSite[k].lotsFound}, новых машин ${perSite[k].newCars}` : perSite[k].status}`)
    .join(" | ");

  await prisma.checkRun.update({
    where: { id: run.id },
    data: { summary, itemsFound: createdCars.length },
  });

  return NextResponse.json({ summary, perSite, createdCars });
}
