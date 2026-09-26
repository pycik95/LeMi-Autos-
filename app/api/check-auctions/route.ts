import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { extractAuctionLots, extractAuctionCarDetail, extractDocumentFields } from "@/lib/extractZulassung";
import { archiveFolderFor, ARCHIVE_ROOT } from "@/lib/archive";
import type { Prisma } from "@prisma/client";
import type { BrowserContext } from "playwright";

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

type InvoiceLink = { href: string; text: string };
type InvoiceKind = "purchase" | "brokerage" | "bnpl" | "transport";

/** Имя файла в архиве не должно содержать зарезервированные Windows символы. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

/** Сумма в имени файла — как у писем (см. app/api/check-mail/route.ts): "1234,56". */
function fmtSum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Определяет тип счёта по подписи ссылки на сайте аукциона — текст может быть на русском,
 * английском или немецком (зависит от языка интерфейса аккаунта). "Подтверждение заказа"/
 * proforma — не настоящий счёт (аналог правила "isRealInvoice" для почты), пропускаем.
 */
function classifyInvoiceLink(text: string): InvoiceKind | null {
  const t = text.toLowerCase();
  if (/proforma|подтверждение заказа|order confirmation|auftragsbestätigung/.test(t)) return null;
  if (/transport|трансп/.test(t)) return "transport";
  if (/buy now,?\s*pay later|bnpl/.test(t)) return "bnpl";
  if (/vehicle invoice|сч[её]т-фактура за авто|fahrzeugrechnung/.test(t)) return "purchase";
  if (/vehicle brokerage|аукционный сч[её]т|auction invoice|vermittlung|сч[её]т за услугу|service invoice/.test(t)) {
    return "brokerage";
  }
  return null;
}

const INVOICE_FILE_SUFFIX: Record<Exclude<InvoiceKind, "purchase">, string> = {
  brokerage: " Vermittlungsgebühr",
  bnpl: " BNPL Gebühr",
  transport: " Transport",
};

async function downloadPdf(context: BrowserContext, href: string, baseUrl: string): Promise<Buffer | null> {
  try {
    const absUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
    const resp = await context.request.get(absUrl);
    if (!resp.ok()) return null;
    return await resp.body();
  } catch {
    return null;
  }
}

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
  const perSite: Record<string, { status: string; lotsFound: number; newCars: number; lotErrors?: number }> = {};
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
        // Ссылки на счета (проформа/счёт на машину/сбор/транспорт) — тоже только в href.
        const invoiceLinksByVin: Record<string, InvoiceLink[]> = {};
        if (key === "auto1") {
          const cards = await page.$$eval(".myOrders-card", (els) =>
            els.map((el) => ({
              vin: el.querySelector('[data-qa-id="myOrders_car_vin"]')?.textContent?.trim() ?? null,
              href: el.querySelector('a[data-qa-id="myOrders_car_title"]')?.getAttribute("href") ?? null,
              links: Array.from(el.querySelectorAll('a[href*="/finance/invoice/"]')).map((a) => ({
                href: a.getAttribute("href") || "",
                text: a.textContent?.trim() || "",
              })),
            }))
          );
          for (const c of cards) {
            if (c.vin && c.href) detailUrlByVin[c.vin.toUpperCase()] = c.href;
            if (c.vin) invoiceLinksByVin[c.vin.toUpperCase()] = c.links;
          }
        }

        let newCars = 0;
        let lotErrors = 0;
        for (const lot of lots) {
          const vin = String(lot.vin).trim().toUpperCase();
          const existing = await prisma.car.findUnique({ where: { vin } });
          if (existing) continue;

          try {
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

          // --- Счета лота: собираем ссылки, скачиваем PDF, распознаём каждый своим промптом ---
          let invoiceLinks: InvoiceLink[] = [];
          if (key === "auto1") {
            invoiceLinks = invoiceLinksByVin[vin] ?? [];
          } else {
            try {
              const cosCard = page.locator("app-finished-checkout-card", { hasText: vin });
              if ((await cosCard.count()) > 0) {
                invoiceLinks = await cosCard
                  .first()
                  .locator('a[href*="cloudinary.com"]')
                  .evaluateAll((as) =>
                    as.map((a) => ({ href: a.getAttribute("href") || "", text: a.textContent?.trim() || "" }))
                  );
              }
            } catch {
              // не нашли ссылки на счета — не критично, создаём машину без них
            }
          }

          const seenHrefs = new Set<string>();
          const pendingDocs: { kind: InvoiceKind; buffer: Buffer; fields: Record<string, unknown> }[] = [];
          for (const link of invoiceLinks) {
            if (!link.href || seenHrefs.has(link.href)) continue;
            seenHrefs.add(link.href);
            const kind = classifyInvoiceLink(link.text);
            if (!kind) continue;
            const buffer = await downloadPdf(context, link.href, "https://www.auto1.com");
            if (!buffer) continue;
            const docType = kind === "purchase" ? "purchase_invoice" : "invoice";
            let extractResult;
            try {
              extractResult = await extractDocumentFields(buffer, "application/pdf", docType);
            } catch {
              // модель/сеть споткнулись на этом счёте — не теряем остальные счета и саму машину
              continue;
            }
            if (!extractResult.ok) continue;
            pendingDocs.push({ kind, buffer, fields: extractResult.fields as Record<string, unknown> });
          }

          // Счёт на машину — уточняем цену/дату/пробег и дозаполняем характеристики поверх
          // того, что уже нашли на странице/в карточке лота (та остаётся приоритетнее для
          // состояния/комплектации — их в счёте нет).
          let finalPriceCents = lot.price != null ? Math.round(lot.price * 100) : null;
          let finalInvoiceDate = lot.date ? new Date(lot.date) : null;
          let finalMileageKm = lot.mileageKm ? Math.round(lot.mileageKm) : null;
          const purchaseDoc = pendingDocs.find((d) => d.kind === "purchase");
          if (purchaseDoc) {
            const pf = purchaseDoc.fields as {
              vehiclePrice?: number | null;
              invoiceDate?: string | null;
              mileageKm?: number | null;
            };
            if (pf.vehiclePrice != null) finalPriceCents = Math.round(pf.vehiclePrice * 100);
            if (pf.invoiceDate) {
              const d = new Date(pf.invoiceDate);
              if (!Number.isNaN(d.getTime())) finalInvoiceDate = d;
            }
            if (pf.mileageKm != null) finalMileageKm = Math.round(pf.mileageKm);
            detailData = { ...detailToCarData(purchaseDoc.fields as CarDetail), ...detailData };
            gotDetail = true;
          }

          const notes = purchaseDoc
            ? `Найдено автопроверкой аукциона (${site.label}) — счёт на машину скачан и приложен, данные уточнены по нему${gotDetail ? " и по карточке лота" : ""}.`
            : `Найдено автопроверкой аукциона (${site.label}) — данные неполные (только то, что видно на странице закупок${gotDetail ? " и в карточке лота" : ""}), дождитесь счёта на почту для деталей и документа.`;

          const car = await prisma.car.create({
            data: {
              ...detailData,
              vin,
              make: lot.make || "?",
              model: lot.model || "?",
              mileageKm: finalMileageKm,
              purchasePriceCents: finalPriceCents,
              lotNumber: lot.lotNumber || null,
              source: site.source,
              invoiceDate: finalInvoiceDate,
              status: "IN_STOCK",
              notes,
              checkRunId: run.id,
            },
          });
          createdCars.push({ id: car.id, vin: car.vin, make: car.make, model: car.model });
          newCars++;

          // Сохраняем скачанные счета в архив (та же раскладка и именование, что у почты/ТЗ:
          // "Ankauf {COS|AUTO1} {Модель} {ID}[ Тип].pdf") и заводим Document/Expense.
          if (pendingDocs.length > 0) {
            const archiveId = key === "cos" ? vin.slice(-4) : lot.lotNumber || vin.slice(-4);
            const baseFileName = sanitize(`Ankauf ${key === "cos" ? "COS" : "AUTO1"} ${lot.model || car.model} ${archiveId}`);
            const folder = archiveFolderFor(finalInvoiceDate || new Date(), "Rechnungen");
            const destDir = path.join(ARCHIVE_ROOT, folder.replace(/\//g, "\\"));
            try {
              fs.mkdirSync(destDir, { recursive: true });
            } catch {
              // не удалось создать папку архива — пропускаем сохранение файлов
            }

            for (const doc of pendingDocs) {
              if (doc.kind === "purchase") {
                const sum = finalPriceCents != null ? ` ${fmtSum(finalPriceCents / 100)}` : "";
                const fileName = sanitize(`${baseFileName}${sum}.pdf`);
                const relPath = `${folder}/${fileName}`;
                try {
                  fs.writeFileSync(path.join(destDir, fileName), doc.buffer);
                  await prisma.document.create({
                    data: { carId: car.id, kind: "PURCHASE_INVOICE", filePath: relPath, fileName, issuedAt: finalInvoiceDate },
                  });
                } catch {
                  // файл с таким путём уже привязан к машине, либо не удалось записать — пропускаем
                }
                continue;
              }

              const f = doc.fields as { amount?: number | null; vatAmount?: number | null; invoiceDate?: string | null; invoiceNumber?: string | null };
              if (f.amount == null) continue;

              const fileName = sanitize(`${baseFileName}${INVOICE_FILE_SUFFIX[doc.kind]} ${fmtSum(f.amount)}.pdf`);
              let savedPath: string | null = null;
              try {
                fs.writeFileSync(path.join(destDir, fileName), doc.buffer);
                savedPath = `${folder}/${fileName}`;
              } catch {
                // не удалось сохранить файл — всё равно заносим сумму расхода
              }

              const expDate = f.invoiceDate ? new Date(f.invoiceDate) : finalInvoiceDate ?? new Date();
              const amountCents = Math.round(f.amount * 100);
              const dup = await prisma.expense.findFirst({ where: { carId: car.id, amountCents, date: expDate } });
              if (dup) continue;

              await prisma.expense.create({
                data: {
                  carId: car.id,
                  title:
                    doc.kind === "transport" ? "Транспорт" : doc.kind === "bnpl" ? "Комиссия за отсрочку (BNPL)" : "Аукционный сбор",
                  category: doc.kind === "transport" ? "DELIVERY" : "AUCTION_FEE",
                  amountCents,
                  vatAmountCents: f.vatAmount != null && Math.abs(f.vatAmount) <= Math.abs(f.amount) ? Math.round(f.vatAmount * 100) : null,
                  date: expDate,
                  invoiceNumber: f.invoiceNumber || null,
                  note: `Найдено автопроверкой аукциона (${site.label}).${savedPath ? ` Файл: ${savedPath}.` : ""}`,
                  checkRunId: run.id,
                },
              });
            }
          }
          } catch (lotErr) {
            // Один лот (счёт не скачался, модель споткнулась и т.п.) не должен обрывать всю
            // партию — машина по нему просто не создастся в этом прогоне, подхватится в
            // следующей проверке. Уже созданные до сбоя машины/файлы остаются как есть.
            lotErrors++;
            console.error(`Лот ${vin} (${site.label}): ошибка обработки —`, lotErr);
          }
        }
        perSite[key] = {
          status: "ok",
          lotsFound: lots.length,
          newCars,
          ...(lotErrors > 0 ? { lotErrors } : {}),
        };
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
    .map((k) => {
      const s = perSite[k];
      if (s.status !== "ok") return `${SITES[k].label}: ${s.status}`;
      const errSuffix = s.lotErrors ? `, ошибок по лотам: ${s.lotErrors}` : "";
      return `${SITES[k].label}: лотов ${s.lotsFound}, новых машин ${s.newCars}${errSuffix}`;
    })
    .join(" | ");

  await prisma.checkRun.update({
    where: { id: run.id },
    data: { summary, itemsFound: createdCars.length },
  });

  return NextResponse.json({ summary, perSite, createdCars });
}
