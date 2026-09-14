"use client";

import { useRouter } from "next/navigation";

const RANGE_OPTIONS = [
  { value: "all", label: "Весь период" },
  { value: "year", label: "По году" },
  { value: "quarter", label: "По кварталу" },
  { value: "month", label: "По месяцу" },
];

const selectCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

export default function PeriodFilter({
  baseUrl,
  range,
  year,
  quarter,
  month,
  years,
}: {
  /** Путь + прочие параметры (статус/сортировка/поиск), БЕЗ range/year/quarter/month. */
  baseUrl: string;
  range: string;
  year: number;
  quarter: number;
  month: number;
  years: number[];
}) {
  const router = useRouter();

  function navigate(next: { range?: string; year?: number; quarter?: number; month?: number }) {
    const url = new URL(baseUrl, window.location.origin);
    const p = url.searchParams;
    const nextRange = next.range ?? range;
    p.set("range", nextRange);
    if (nextRange !== "all") p.set("year", String(next.year ?? year));
    if (nextRange === "quarter") p.set("quarter", String(next.quarter ?? quarter));
    if (nextRange === "month") p.set("month", String(next.month ?? month));
    router.push(`${url.pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Период</span>
        <select
          className={selectCls}
          value={range}
          onChange={(e) => navigate({ range: e.target.value })}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {range !== "all" && (
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Год</span>
          <select
            className={selectCls}
            value={year}
            onChange={(e) => navigate({ year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}

      {range === "quarter" && (
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Квартал</span>
          <select
            className={selectCls}
            value={quarter}
            onChange={(e) => navigate({ quarter: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </label>
      )}

      {range === "month" && (
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Месяц</span>
          <select
            className={selectCls}
            value={month}
            onChange={(e) => navigate({ month: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
