import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinance } from "@/lib/finance";
import { carToDTO } from "@/lib/serialize";
import { formatEUR, formatDate } from "@/lib/format";
import { quarterRange, yearRange, monthRange, currentQuarter, type Period } from "@/lib/period";
import NavigateSelect from "@/components/NavigateSelect";
import PeriodFilter from "@/components/PeriodFilter";
import InlineStatusSelect from "@/components/InlineStatusSelect";
import SaleDocumentDropzone from "@/components/SaleDocumentDropzone";
import type { CarStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "IN_STOCK", label: "В наличии" },
  { value: "IN_PREP", label: "В подготовке" },
  { value: "SOLD", label: "Продан" },
];

type SortKey = "make" | "purchase" | "sale" | "income" | "invoiceDate" | "soldAt";

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function SortHeader({
  label,
  href,
  active,
  dir,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 hover:text-slate-900 ${
        active ? "text-slate-900 font-semibold" : ""
      }`}
    >
      {label}
      {active && <span className="text-xs">{dir === "asc" ? "▲" : "▼"}</span>}
    </Link>
  );
}

export default async function CarsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    dir?: string;
    range?: string;
    by?: string;
    year?: string;
    quarter?: string;
    month?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeStatus = (sp.status as CarStatus | undefined) ?? undefined;

  const fallback = currentQuarter();
  const now = new Date();
  const range = sp.range ?? "quarter";
  const year = sp.year ? Number(sp.year) : fallback.year;
  const quarter = sp.quarter ? Number(sp.quarter) : fallback.quarter;
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  let period: Period | null = null;
  if (range === "year") period = yearRange(year);
  else if (range === "quarter") period = quarterRange(year, quarter);
  else if (range === "month") period = monthRange(year, month);

  // По какой дате отбирается период: по дате счёта (как раньше) или по дате продажи.
  const by: "invoice" | "sold" = sp.by === "sold" ? "sold" : "invoice";
  const dateField = by === "sold" ? "soldAt" : "invoiceDate";

  const sort: SortKey = (sp.sort as SortKey) ?? (by === "sold" ? "soldAt" : "invoiceDate");
  const dir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "make" ? "asc" : "desc";

  // Текстовый поиск (по VIN/марке/модели) ищет конкретную машину — не должен
  // молча ограничиваться выбранным периодом (иначе поиск существующего VIN
  // может показать "0 записей", если машина вне текущего квартала).
  const searchActive = Boolean(sp.q);

  const cars = await prisma.car.findMany({
    where: {
      checkRunId: null, // ещё не подтверждённые на /check карточки сюда не попадают
      status: activeStatus || undefined,
      [dateField]: period && !searchActive ? { gte: period.start, lt: period.end } : undefined,
      ...(sp.q
        ? {
            OR: [
              { vin: { contains: sp.q } },
              { make: { contains: sp.q } },
              { model: { contains: sp.q } },
            ],
          }
        : {}),
    },
    include: { expenses: true, documents: true },
  });

  function hasSaleDocument(car: (typeof cars)[number]): boolean {
    return car.documents.some((d) => d.kind === "SALE_CONTRACT");
  }

  const rows = cars.map((car) => {
    const dto = carToDTO(car);
    const fin = calculateFinance(dto, dto.expenses ?? []);
    return { car, dto, fin };
  });

  const sortValue = (r: (typeof rows)[number]): string | number => {
    switch (sort) {
      case "make":
        return `${r.car.make} ${r.car.model}`.toLowerCase();
      case "purchase":
        return r.fin.purchasePrice ?? -Infinity;
      case "sale":
        return r.fin.salePrice ?? -Infinity;
      case "income":
        return r.fin.preTaxIncome ?? -Infinity;
      case "invoiceDate":
        return r.car.invoiceDate ? r.car.invoiceDate.getTime() : -Infinity;
      case "soldAt":
        return r.car.soldAt ? r.car.soldAt.getTime() : -Infinity;
    }
  };
  rows.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });

  // Общие для всех фильтров параметры, кроме периода — база для PeriodFilter,
  // чтобы смена периода не сбрасывала статус/сортировку/поиск.
  const otherParams = new URLSearchParams();
  if (activeStatus) otherParams.set("status", activeStatus);
  if (sp.q) otherParams.set("q", sp.q);
  if (by === "sold") otherParams.set("by", "sold");
  if (sp.sort) otherParams.set("sort", sp.sort);
  if (sp.dir) otherParams.set("dir", sp.dir);
  const otherUrl = `/cars?${otherParams.toString()}`;

  const currentParams = new URLSearchParams(otherParams);
  currentParams.set("range", range);
  currentParams.set("year", String(year));
  currentParams.set("quarter", String(quarter));
  currentParams.set("month", String(month));
  const currentUrl = `/cars?${currentParams.toString()}`;

  function sortHref(key: SortKey): string {
    const params = new URLSearchParams(currentParams);
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : key === "make" ? "asc" : "desc";
    params.set("sort", key);
    params.set("dir", nextDir);
    return `/cars?${params.toString()}`;
  }

  const years = Array.from({ length: 5 }, (_, i) => fallback.year - i);

  // Сводка «сколько продано по месяцам» — всегда по дате ПРОДАЖИ и по выбранному году
  // (не зависит от фильтра периода/статуса таблицы ниже, чтобы видеть картину года целиком).
  const yr = yearRange(year);
  const soldInYear = await prisma.car.findMany({
    where: { checkRunId: null, status: "SOLD", soldAt: { gte: yr.start, lt: yr.end } },
    include: { expenses: true },
  });
  const monthly = MONTH_LABELS.map(() => ({ count: 0, revenue: 0, income: 0 }));
  for (const c of soldInYear) {
    const dto = carToDTO(c);
    const fin = calculateFinance(dto, dto.expenses ?? []);
    const m = monthly[c.soldAt!.getMonth()];
    m.count += 1;
    m.revenue += fin.salePrice ?? 0;
    m.income += fin.preTaxIncome ?? 0;
  }
  const yearTotal = monthly.reduce(
    (a, m) => ({ count: a.count + m.count, revenue: a.revenue + m.revenue, income: a.income + m.income }),
    { count: 0, revenue: 0, income: 0 }
  );
  function monthHref(m: number): string {
    const params = new URLSearchParams(currentParams);
    params.set("range", "month");
    params.set("year", String(year));
    params.set("month", String(m));
    params.set("by", "sold");
    params.delete("status");
    params.delete("sort");
    params.delete("dir");
    return `/cars?${params.toString()}`;
  }
  function byHref(next: "invoice" | "sold"): string {
    const params = new URLSearchParams(currentParams);
    if (next === "sold") params.set("by", "sold");
    else params.delete("by");
    params.delete("sort");
    params.delete("dir");
    return `/cars?${params.toString()}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Машины</h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} записей</p>
        </div>
        <Link
          href="/cars/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          + Добавить машину
        </Link>
      </div>

      <SaleDocumentDropzone />

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Продано по месяцам, {year}</h2>
          <div className="text-xs text-slate-500">
            всего {yearTotal.count} шт. · выручка {formatEUR(yearTotal.revenue)} · доход до налога {formatEUR(yearTotal.income)}
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          {monthly.map((m, i) => {
            const selected = range === "month" && by === "sold" && month === i + 1;
            return (
              <Link
                key={i}
                href={monthHref(i + 1)}
                title={`${MONTH_LABELS[i]}: продано ${m.count}, выручка ${formatEUR(m.revenue)}, доход до налога ${formatEUR(m.income)}`}
                className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                  selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>{MONTH_LABELS[i]}</div>
                <div className="text-lg font-semibold tabular-nums leading-tight">{m.count}</div>
                <div className={`text-[11px] tabular-nums ${selected ? "text-slate-300" : "text-slate-400"}`}>
                  {m.count ? formatEUR(m.revenue) : "—"}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {by === "sold" && (
        <div className="mb-3 text-sm text-slate-500">
          Показаны машины, проданные в выбранном периоде.{" "}
          <Link href={byHref("invoice")} className="text-slate-700 underline hover:text-slate-900">
            Вернуться к списку по дате покупки
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <PeriodFilter
          baseUrl={otherUrl}
          range={range}
          year={year}
          quarter={quarter}
          month={month}
          years={years}
        />

        <form className="flex items-end gap-3" action="/cars">
          <input type="hidden" name="range" value={range} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="quarter" value={quarter} />
          <input type="hidden" name="month" value={month} />
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          {by === "sold" && <input type="hidden" name="by" value="sold" />}
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
          {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Поиск по VIN или модели"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Найти
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Нет машин по выбранному фильтру
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">
                  <SortHeader label="Марка / модель" href={sortHref("make")} active={sort === "make"} dir={dir} />
                </th>
                <th className="px-5 py-3 font-medium">
                  <NavigateSelect
                    value={activeStatus ?? ""}
                    options={STATUS_OPTIONS}
                    baseUrl={currentUrl}
                    paramName="status"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600"
                  />
                </th>
                <th className="px-5 py-3 font-medium text-right">
                  <SortHeader label="Закупка, €" href={sortHref("purchase")} active={sort === "purchase"} dir={dir} />
                </th>
                <th className="px-5 py-3 font-medium text-right">
                  <SortHeader label="Продажа, €" href={sortHref("sale")} active={sort === "sale"} dir={dir} />
                </th>
                <th className="px-5 py-3 font-medium text-right">
                  <SortHeader label="Доход до налога, €" href={sortHref("income")} active={sort === "income"} dir={dir} />
                </th>
                <th className="px-5 py-3 font-medium">
                  <SortHeader label="Дата покупки" href={sortHref("invoiceDate")} active={sort === "invoiceDate"} dir={dir} />
                </th>
                <th className="px-5 py-3 font-medium">
                  <SortHeader label="Дата продажи" href={sortHref("soldAt")} active={sort === "soldAt"} dir={dir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ car, dto, fin }) => (
                <tr
                  key={car.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link href={`/cars/${car.id}`} className="font-medium text-slate-900 hover:underline">
                      {car.make} {car.model}
                    </Link>
                    <div className="text-xs text-slate-400 mt-0.5">{car.vin}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <InlineStatusSelect carId={car.id} status={car.status} />
                      {car.status === "SOLD" && !hasSaleDocument(car) && (
                        <span
                          title="Договор продажи не привязан"
                          className="text-xs font-medium text-rose-600 whitespace-nowrap"
                        >
                          ⚠ нет договора
                        </span>
                      )}
                      {dto.taxScheme === "REGULAR_19" && (
                        <span
                          title="Regelbesteuerung — обычный НДС 19% с полной цены продажи, не схема маржи §25a"
                          className="text-xs font-medium text-amber-600 whitespace-nowrap"
                        >
                          19% НДС
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">{formatEUR(fin.purchasePrice)}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{formatEUR(fin.salePrice)}</td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      fin.preTaxIncome === null
                        ? "text-slate-300"
                        : fin.preTaxIncome >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {formatEUR(fin.preTaxIncome)}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(car.invoiceDate)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(car.soldAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
