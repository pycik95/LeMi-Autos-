import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { extractAuctionLots, extractAuctionCarDetail } from "@/lib/extractZulassung";
import type { Prisma } from "@prisma/client";

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

type CarDetail = {
  color?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  doors?: string | null;
  emissionClass?: string | null;
  interiorMaterial?: string | null;
  condition?: string | null;
  features?: string[] | null;
  owners?: number | null;
  mileageKm?: number | null;
  firstRegistration?: string | null;
  engineCcm?: number | null;
  powerKw?: number | null;
  tuvUntil?: string | null;
};

const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID", "OTHER"];
const TRANSMISSIONS = ["MANUAL", "AUTOMATIC"];

/** Превращает распознанные детали лота AUTO1 в поля для Car — только валидные значения. */
function detailToCarData(d: CarDetail): Prisma.CarUncheckedCreateInput {
  const data: Record<string, unknown> = {};
  if (d.color) data.color = d.color;
  if (d.fuelType && FUEL_TYPES.includes(d.fuelType)) data.fuelType = d.fuelType;
  if (d.transmission && TRANSMISSIONS.includes(d.transmission)) data.transmission = d.transmission;
  if (d.bodyType) data.bodyType = d.bodyType;
  if (d.doors) data.doors = d.doors;
  if (d.emissionClass) data.emissionClass = d.emissionClass;
  if (d.interiorMaterial) data.interiorMaterial = d.interiorMaterial;
  if (d.condition) data.condition = d.condition;
  if (d.features && d.features.length > 0) data.features = d.features.join(",");
  if (d.owners != null) data.owners = Math.round(d.owners);
  if (d.firstRegistration) {
    const dt = new Date(d.firstRegistration);
    if (!Number.isNaN(dt.getTime())) data.firstRegistration = dt;
  }
  if (d.engineCcm != null) data.displacementCcm = Math.round(d.engineCcm);
  if (d.powerKw != null) data.powerKw = d.powerKw;
  if (d.tuvUntil) {
    const dt = new Date(d.tuvUntil);
    if (!Number.isNaN(dt.getTime())) data.tuvUntil = dt;
  }
  return data as Prisma.CarUncheckedCreateInput;
}

/**
 * Кнопка "Проверить аукционы" — читает страницу "мои закупки" CarOnSale/AUTO1 через сохранённую
 * сессию (.auth/{site}.json, см. scripts/auction-login.mjs — пароль сюда никогда не попадает),
 * достаёт список выигранных лотов моделью и заводит карточки новых машин с checkRunId — они ждут
 * подтверждения на /check, как и всё остальное, найденное автопроверкой (см. app/api/check-mail/route.ts).
 * Для каждого нового лота дополнительно заходим в карточку лота (у AUTO1 — отдельная страница
 * /merchant/car/{id}, у CarOnSale — боковая панель по клику на модель в списке) и вытаскиваем
 * характеристики (цвет/коробка/комплектация/состояние и т.п.) — но данные всё равно неполные,
 * итоговые дозаполняются счётом с почты.
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

  const browser = await chromium.launch({ headless: true, channel: "msedge" });

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
        await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: 15000 });
        } catch {
          // AUTO1 держит фоновые запросы открытыми, networkidle может не наступить — не критично
        }
        await page.waitForTimeout(2000);
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

        // У AUTO1 есть отдельная страница "все детали автомобиля" на каждый лот
        // (/merchant/car/{id}, ссылка есть только в href, в видимом тексте её нет — поэтому
        // достаём напрямую из DOM списка, сопоставляя по VIN).
        const detailUrlByVin: Record<string, string> = {};
        if (key === "auto1") {
          const cards = await page.$$eval(".myOrders-card", (els) =>
            els.map((el) => ({
              vin: el.querySelector('[data-qa-id="myOrders_car_vin"]')?.textContent?.trim() ?? null,
              href: el.querySelector('a[data-qa-id="myOrders_car_title"]')?.getAttribute("href") ?? null,
            }))
          );
          for (const c of cards) {
            if (c.vin && c.href) detailUrlByVin[c.vin.toUpperCase()] = c.href;
          }
        }

        let newCars = 0;
        for (const lot of lots) {
          const vin = String(lot.vin).trim().toUpperCase();
          const existing = await prisma.car.findUnique({ where: { vin } });
          if (existing) continue;

          let detailData: Prisma.CarUncheckedCreateInput = {} as Prisma.CarUncheckedCreateInput;
          let gotDetail = false;

          if (key === "auto1") {
            const detailUrl = detailUrlByVin[vin];
            if (detailUrl) {
              try {
                const detailPage = await context.newPage();
                const absUrl = detailUrl.startsWith("http") ? detailUrl : `https://www.auto1.com${detailUrl}`;
                await detailPage.goto(absUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
                try {
                  await detailPage.waitForLoadState("networkidle", { timeout: 10000 });
                } catch {
                  // не критично, страница уже отрисована
                }
                const detailText = await detailPage.innerText("body");
                await detailPage.close();
                const detailResult = await extractAuctionCarDetail(detailText);
                if (detailResult.ok) {
                  detailData = detailToCarData(detailResult.fields as CarDetail);
                  gotDetail = true;
                }
              } catch {
                // не удалось открыть карточку лота — просто создаём машину без доп. деталей
              }
            }
          } else if (key === "cos") {
            // У CarOnSale карточка лота — не отдельная страница, а боковая панель, открывается
            // кликом по названию модели в списке (та же страница, без перехода по URL). Закрываем
            // Escape-ом перед следующим лотом, иначе панель перекроет клик по следующей карточке.
            try {
              const cosCard = page.locator("app-finished-checkout-card", { hasText: vin });
              if ((await cosCard.count()) > 0) {
                const cosTitle = cosCard.first().locator("enzo-headline.title");
                await cosTitle.scrollIntoViewIfNeeded();
                await cosTitle.click({ force: true, timeout: 10000 });
                await page.waitForTimeout(2500);
                const detailPanel = page.locator("app-auction-detail-view");
                if ((await detailPanel.count()) > 0) {
                  const detailText = await detailPanel.first().innerText();
                  const detailResult = await extractAuctionCarDetail(detailText);
                  if (detailResult.ok) {
                    detailData = detailToCarData(detailResult.fields as CarDetail);
                    gotDetail = true;
                  }
                }
                await page.keyboard.press("Escape").catch(() => {});
                await page.waitForTimeout(500);
              }
            } catch {
              // не удалось открыть карточку лота — просто создаём машину без доп. деталей
              await page.keyboard.press("Escape").catch(() => {});
            }
          }

          const car = await prisma.car.create({
            data: {
              ...detailData,
              vin,
              make: lot.make || "?",
              model: lot.model || "?",
              mileageKm: lot.mileageKm ? Math.round(lot.mileageKm) : null,
              purchasePriceCents: lot.price != null ? Math.round(lot.price * 100) : null,
              lotNumber: lot.lotNumber || null,
              source: site.source,
              invoiceDate: lot.date ? new Date(lot.date) : null,
              status: "IN_STOCK",
              notes: `Найдено автопроверкой аукциона (${site.label}) — данные неполные (только то, что видно на странице закупок${gotDetail ? " и в карточке лота" : ""}), дождитесь счёта на почту для деталей и документа.`,
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
