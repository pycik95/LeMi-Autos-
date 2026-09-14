import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinance } from "@/lib/finance";
import { carToDTO, generalExpenseToDTO, serviceToDTO } from "@/lib/serialize";
import { formatEUR, formatDate } from "@/lib/format";
import { quarterRange, monthRange, currentQuarter, type Period } from "@/lib/period";

const selectCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

type PeriodTotals = {
  label: string;
  carsIncome: number;
  carsVat: number;
  serviceNet: number;
  serviceVat: number;
  generalNet: number;
  generalVat: number;
  incomeBase: number;
  vatDueTotal: number;
};

async function computePeriodTotals(period: Period): Promise<PeriodTotals> {
  const [soldCars, services, generalExpenses] = await Promise.all([
    prisma.car.findMany({
      where: { status: "SOLD", soldAt: { gte: period.start, lt: period.end } },
      include: { expenses: true },
    }),
    prisma.service.findMany({ where: { date: { gte: period.start, lt: period.end } } }),
    prisma.generalExpense.findMany({ where: { date: { gte: period.start, lt: period.end } } }),
  ]);

  const carBreakdowns = soldCars.map((car) => {
    const dto = carToDTO(car);
    return calculateFinance(dto, dto.expenses ?? []);
  });

  const carsIncome = carBreakdowns.reduce((s, b) => s + (b.preTaxIncome ?? 0), 0);
  const carsVat = carBreakdowns.reduce((s, b) => s + (b.vatDue ?? 0), 0);

  const serviceDtos = services.map(serviceToDTO);
  const serviceNet = serviceDtos.reduce((s, x) => s + (x.amount - (x.vatAmount ?? 0)), 0);
  const serviceVat = serviceDtos.reduce((s, x) => s + (x.vatAmount ?? 0), 0);

  const generalDtos = generalExpenses.map(generalExpenseToDTO);
  const generalNet = generalDtos.reduce((s, x) => s + (x.amount - (x.vatAmount ?? 0)), 0);
  const generalVat = generalDtos.reduce((s, x) => s + (x.vatAmount ?? 0), 0);

  return {
    label: period.label,
    carsIncome,
    carsVat,
    serviceNet,
    serviceVat,
    generalNet,
    generalVat,
    incomeBase: carsIncome + serviceNet - generalNet,
    vatDueTotal: carsVat + serviceVat - generalVat,
  };
}

function sumPeriods(periods: PeriodTotals[], label: string): PeriodTotals {
  const sum = (key: keyof Omit<PeriodTotals, "label">) =>
    periods.reduce((s, p) => s + p[key], 0);
  return {
    label,
    carsIncome: sum("carsIncome"),
    carsVat: sum("carsVat"),
    serviceNet: sum("serviceNet"),
    serviceVat: sum("serviceVat"),
    generalNet: sum("generalNet"),
    generalVat: sum("generalVat"),
    incomeBase: sum("incomeBase"),
    vatDueTotal: sum("vatDueTotal"),
  };
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const sp = await searchParams;
  const fallback = currentQuarter();
  const year = sp.year ? Number(sp.year) : fallback.year;
  const quarter = sp.quarter ? Number(sp.quarter) : fallback.quarter;

  const qPeriod = quarterRange(year, quarter);
  const monthNumbers = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];

  const monthTotals = await Promise.all(
    monthNumbers.map((m) => computePeriodTotals(monthRange(year, m)))
  );
  const quarterTotals = sumPeriods(monthTotals, qPeriod.label);

  const incomeTax = Math.max(quarterTotals.incomeBase, 0) * 0.3;
  const profitAfterTax = quarterTotals.incomeBase - incomeTax;

  const soldCars = await prisma.car.findMany({
    where: { status: "SOLD", soldAt: { gte: qPeriod.start, lt: qPeriod.end } },
    include: { expenses: true },
    orderBy: { soldAt: "asc" },
  });
  const carRows = soldCars.map((car) => {
    const dto = carToDTO(car);
    const breakdown = calculateFinance(dto, dto.expenses ?? []);
    return { dto, breakdown };
  });

  const years = Array.from({ length: 5 }, (_, i) => fallback.year - i);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Отчёт за квартал
          </h1>
          <p className="text-sm text-slate-500 mt-1">{qPeriod.label}</p>
        </div>
        <form className="flex flex-wrap items-end gap-3" action="/report">
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
            <select name="quarter" defaultValue={String(quarter)} className={selectCls}>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Налоговая база за квартал
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">
            {formatEUR(quarterTotals.incomeBase)}
          </div>
          <div className="text-xs text-slate-400 mt-1">машины + услуги − общие расходы</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Подоходный налог (30%)
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{formatEUR(incomeTax)}</div>
          <div className="text-xs text-slate-400 mt-1">от налоговой базы за квартал</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Прибыль после налога
          </div>
          <div className="text-2xl font-bold mt-1 text-white">{formatEUR(profitAfterTax)}</div>
          <div className="text-xs text-slate-400 mt-1">за {qPeriod.label}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          НДС к уплате за квартал
        </div>
        <div className="text-2xl font-bold text-slate-900">{formatEUR(quarterTotals.vatDueTotal)}</div>
        <div className="text-xs text-slate-400 mt-1">
          НДС с маржи по машинам + исходящий НДС по услугам − входящий НДС по расходам машин и общим расходам
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">По месяцам</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Месяц</th>
                <th className="px-5 py-2 font-medium text-right">Доход по машинам</th>
                <th className="px-5 py-2 font-medium text-right">Услуги (нетто)</th>
                <th className="px-5 py-2 font-medium text-right">Общие расходы (нетто)</th>
                <th className="px-5 py-2 font-medium text-right">НДС к уплате</th>
                <th className="px-5 py-2 font-medium text-right">Налоговая база</th>
              </tr>
            </thead>
            <tbody>
              {monthTotals.map((m) => (
                <tr key={m.label} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-700">{m.label}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(m.carsIncome)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(m.serviceNet)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    − {formatEUR(m.generalNet)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(m.vatDueTotal)}</td>
                  <td className="px-5 py-2 text-right tabular-nums font-medium">
                    {formatEUR(m.incomeBase)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/50 font-semibold text-slate-900">
                <td className="px-5 py-3">Итого за {qPeriod.label}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatEUR(quarterTotals.carsIncome)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatEUR(quarterTotals.serviceNet)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  − {formatEUR(quarterTotals.generalNet)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatEUR(quarterTotals.vatDueTotal)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatEUR(quarterTotals.incomeBase)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Проданные машины ({carRows.length})
          </h3>
        </div>
        {carRows.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            Нет проданных машин в этом квартале
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Машина</th>
                <th className="px-5 py-2 font-medium">Дата продажи</th>
                <th className="px-5 py-2 font-medium text-right">Доход до налога</th>
              </tr>
            </thead>
            <tbody>
              {carRows.map(({ dto, breakdown }) => (
                <tr key={dto.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2">
                    <Link href={`/cars/${dto.id}`} className="text-slate-900 hover:underline">
                      {dto.make} {dto.model}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-slate-500">{formatDate(dto.soldAt)}</td>
                  <td className="px-5 py-2 text-right font-medium">
                    {formatEUR(breakdown.preTaxIncome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
