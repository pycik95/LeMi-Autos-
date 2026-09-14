import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { privateEntryToDTO } from "@/lib/serialize";
import { formatEUR, formatDate } from "@/lib/format";
import { quarterRange, yearRange, monthRange, currentQuarter } from "@/lib/period";

const selectCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

export default async function DopUslugiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const sp = await searchParams;
  const fallback = currentQuarter();
  const year = sp.year ? Number(sp.year) : fallback.year;
  // quarter="" означает «весь год»
  const quarter = sp.quarter === "" ? null : sp.quarter ? Number(sp.quarter) : fallback.quarter;

  const period = quarter ? quarterRange(year, quarter) : yearRange(year);
  const monthNumbers = quarter
    ? [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3]
    : Array.from({ length: 12 }, (_, i) => i + 1);

  const monthTotals = await Promise.all(
    monthNumbers.map(async (m) => {
      const p = monthRange(year, m);
      const entries = await prisma.privateEntry.findMany({
        where: { date: { gte: p.start, lt: p.end } },
      });
      const income = entries.filter((e) => e.kind === "INCOME").reduce((s, e) => s + e.amountCents, 0) / 100;
      const expense = entries.filter((e) => e.kind === "EXPENSE").reduce((s, e) => s + e.amountCents, 0) / 100;
      return { label: p.label, income, expense, net: income - expense };
    })
  );

  const periodTotals = {
    income: monthTotals.reduce((s, m) => s + m.income, 0),
    expense: monthTotals.reduce((s, m) => s + m.expense, 0),
    net: monthTotals.reduce((s, m) => s + m.net, 0),
  };

  const entries = await prisma.privateEntry.findMany({
    where: { date: { gte: period.start, lt: period.end } },
    include: { car: { select: { id: true, make: true, model: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const years = Array.from({ length: 5 }, (_, i) => fallback.year - i);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Доп. услуги</h1>
          <p className="text-sm text-slate-500 mt-1">{period.label}</p>
        </div>
        <form className="flex flex-wrap items-end gap-3" action="/dop-uslugi">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Год</span>
            <select name="year" defaultValue={String(year)} className={selectCls}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Квартал</span>
            <select name="quarter" defaultValue={quarter ? String(quarter) : ""} className={selectCls}>
              <option value="">Весь год</option>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Показать
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">По месяцам</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-5 py-2 font-medium">Месяц</th>
              <th className="px-5 py-2 font-medium text-right">Доход</th>
              <th className="px-5 py-2 font-medium text-right">Расход</th>
              <th className="px-5 py-2 font-medium text-right">Нетто</th>
            </tr>
          </thead>
          <tbody>
            {monthTotals.map((m) => (
              <tr key={m.label} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2 text-slate-700">{m.label}</td>
                <td className="px-5 py-2 text-right tabular-nums">{formatEUR(m.income)}</td>
                <td className="px-5 py-2 text-right tabular-nums">− {formatEUR(m.expense)}</td>
                <td className="px-5 py-2 text-right tabular-nums font-medium">{formatEUR(m.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/50 font-semibold text-slate-900">
              <td className="px-5 py-3">Итого за {period.label}</td>
              <td className="px-5 py-3 text-right tabular-nums">{formatEUR(periodTotals.income)}</td>
              <td className="px-5 py-3 text-right tabular-nums">− {formatEUR(periodTotals.expense)}</td>
              <td className="px-5 py-3 text-right tabular-nums">{formatEUR(periodTotals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Записи за {period.label}</h3>
        </div>
        {entries.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Нет записей за этот период</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Дата</th>
                <th className="px-5 py-2 font-medium">Название</th>
                <th className="px-5 py-2 font-medium">Машина</th>
                <th className="px-5 py-2 font-medium text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const dto = privateEntryToDTO(e);
                return (
                  <tr key={dto.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2 text-slate-500">{formatDate(dto.date)}</td>
                    <td className="px-5 py-2 text-slate-700">{dto.title}</td>
                    <td className="px-5 py-2">
                      {e.car ? (
                        <Link href={`/cars/${e.car.id}`} className="text-slate-900 hover:underline">
                          {e.car.make} {e.car.model}
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums font-medium">
                      {dto.kind === "INCOME" ? "+" : "−"} {formatEUR(dto.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
