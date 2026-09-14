import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { expenseToDTO, generalExpenseToDTO } from "@/lib/serialize";
import { EXPENSE_CATEGORY_LABELS, GENERAL_EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import { formatEUR, formatDate } from "@/lib/format";
import { quarterRange, yearRange, currentQuarter } from "@/lib/period";
import type { ExpenseCategory, GeneralExpenseCategory } from "@/lib/types";
import GeneralExpensesPageClient from "@/components/GeneralExpensesPageClient";

const selectCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    carId?: string;
    carCategory?: string;
    genCategory?: string;
    year?: string;
    quarter?: string;
  }>;
}) {
  const sp = await searchParams;
  const fallback = currentQuarter();

  const year = sp.year ? Number(sp.year) : fallback.year;
  // quarter="" означает «весь год»
  const quarter = sp.quarter === "" ? null : sp.quarter ? Number(sp.quarter) : fallback.quarter;
  const period = quarter ? quarterRange(year, quarter) : yearRange(year);

  const machine = sp.carId || ""; // "" = все, "gen" = только общие расходы, иначе id машины
  const showCars = machine !== "gen";
  const showGeneral = machine === "" || machine === "gen";
  const selectedCarId = showCars && machine !== "" && machine !== "gen" ? machine : undefined;

  const carCategory = (sp.carCategory || undefined) as ExpenseCategory | undefined;
  const genCategory = (sp.genCategory || undefined) as GeneralExpenseCategory | undefined;

  // Машины предлагаем в фильтре, только если у них есть расходы в выбранном периоде —
  // иначе выбор машины без активности в периоде всегда даёт пустой список без объяснения.
  const carsWithActivity = await prisma.car.findMany({
    where: { expenses: { some: { date: { gte: period.start, lt: period.end } } } },
    orderBy: [{ make: "asc" }, { model: "asc" }],
    select: { id: true, make: true, model: true, vin: true },
  });

  const [carExpenses, generalExpenses] = await Promise.all([
    showCars
      ? prisma.expense.findMany({
          where: {
            carId: selectedCarId,
            category: carCategory,
            date: { gte: period.start, lt: period.end },
          },
          include: { car: true },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    showGeneral
      ? prisma.generalExpense.findMany({
          where: { category: genCategory, date: { gte: period.start, lt: period.end } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
  ]);

  const carRows = carExpenses.map((e) => ({ dto: expenseToDTO(e), car: e.car }));
  const generalDtos = generalExpenses.map(generalExpenseToDTO);

  const totalGross =
    carRows.reduce((s, r) => s + r.dto.amount, 0) + generalDtos.reduce((s, e) => s + e.amount, 0);
  const totalVat =
    carRows.reduce((s, r) => s + (r.dto.vatAmount ?? 0), 0) +
    generalDtos.reduce((s, e) => s + (e.vatAmount ?? 0), 0);
  const missingVat =
    carRows.filter((r) => r.dto.vatAmount === null).length +
    generalDtos.filter((e) => e.vatAmount === null).length;

  const byCarCategory = Object.keys(EXPENSE_CATEGORY_LABELS)
    .map((key) => {
      const rows = carRows.filter((r) => r.dto.category === key);
      return {
        key,
        label: EXPENSE_CATEGORY_LABELS[key],
        count: rows.length,
        gross: rows.reduce((s, r) => s + r.dto.amount, 0),
        vat: rows.reduce((s, r) => s + (r.dto.vatAmount ?? 0), 0),
      };
    })
    .filter((c) => c.count > 0);

  const byGenCategory = Object.keys(GENERAL_EXPENSE_CATEGORY_LABELS)
    .map((key) => {
      const rows = generalDtos.filter((e) => e.category === key);
      return {
        key,
        label: GENERAL_EXPENSE_CATEGORY_LABELS[key],
        count: rows.length,
        gross: rows.reduce((s, e) => s + e.amount, 0),
        vat: rows.reduce((s, e) => s + (e.vatAmount ?? 0), 0),
      };
    })
    .filter((c) => c.count > 0);

  const years = Array.from({ length: 5 }, (_, i) => fallback.year - i);
  const totalCount = carRows.length + generalDtos.length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Расходы</h1>
        <p className="text-sm text-slate-500 mt-1">
          {totalCount} записей за {period.label}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 mb-6" action="/expenses">
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
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Машина</span>
          <select name="carId" defaultValue={machine} className={selectCls}>
            <option value="">Все (по машинам + общие)</option>
            <option value="gen">Только общие расходы</option>
            {carsWithActivity.map((c) => (
              <option key={c.id} value={c.id}>
                {c.make} {c.model} — {c.vin.slice(-6)}
              </option>
            ))}
          </select>
        </label>
        {showCars && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Категория (по машине)</span>
            <select name="carCategory" defaultValue={carCategory ?? ""} className={selectCls}>
              <option value="">Все категории</option>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {showGeneral && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Категория (общие)</span>
            <select name="genCategory" defaultValue={genCategory ?? ""} className={selectCls}>
              <option value="">Все категории</option>
              {Object.entries(GENERAL_EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Показать
        </button>
        <Link
          href="/expenses"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Сбросить
        </Link>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Расходы брутто
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{formatEUR(totalGross)}</div>
          <div className="text-xs text-slate-400 mt-1">за {period.label}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Входящий НДС (Vorsteuer)
          </div>
          <div className="text-2xl font-bold mt-1 text-white">{formatEUR(totalVat)}</div>
          <div className="text-xs text-slate-400 mt-1">
            в Umsatzsteuervoranmeldung за {period.label}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Без указанного НДС
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              missingVat > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {missingVat}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {missingVat > 0 ? "проверьте счета — Vorsteuer не заполнен" : "все счета заполнены"}
          </div>
        </div>
      </div>

      {(byCarCategory.length > 0 || byGenCategory.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">По категориям</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Категория</th>
                <th className="px-5 py-2 font-medium text-right">Записей</th>
                <th className="px-5 py-2 font-medium text-right">Брутто</th>
                <th className="px-5 py-2 font-medium text-right">Входящий НДС</th>
              </tr>
            </thead>
            <tbody>
              {byCarCategory.map((c) => (
                <tr key={`car-${c.key}`} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-700">🚗 {c.label}</td>
                  <td className="px-5 py-2 text-right text-slate-500">{c.count}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(c.gross)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(c.vat)}</td>
                </tr>
              ))}
              {byGenCategory.map((c) => (
                <tr key={`gen-${c.key}`} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-700">🏢 {c.label}</td>
                  <td className="px-5 py-2 text-right text-slate-500">{c.count}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(c.gross)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEUR(c.vat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCars && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Расходы по машинам</h3>
          </div>
          {carRows.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              Нет расходов по машинам за выбранный период
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-5 py-3 font-medium">Дата</th>
                    <th className="px-5 py-3 font-medium">Машина</th>
                    <th className="px-5 py-3 font-medium">Название</th>
                    <th className="px-5 py-3 font-medium">Категория</th>
                    <th className="px-5 py-3 font-medium">№ счёта</th>
                    <th className="px-5 py-3 font-medium text-right">Сумма, €</th>
                    <th className="px-5 py-3 font-medium text-right">Из них НДС, €</th>
                  </tr>
                </thead>
                <tbody>
                  {carRows.map(({ dto, car }) => (
                    <tr
                      key={dto.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(dto.date)}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/cars/${car.id}`}
                          className="text-slate-900 hover:underline whitespace-nowrap"
                        >
                          {car.make} {car.model}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{dto.title}</td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                        {EXPENSE_CATEGORY_LABELS[dto.category]}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">{dto.invoiceNumber ?? "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {formatEUR(dto.amount)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right tabular-nums ${
                          dto.vatAmount === null ? "text-amber-600" : "text-slate-700"
                        }`}
                      >
                        {dto.vatAmount === null ? "не указан" : formatEUR(dto.vatAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showGeneral && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Общие расходы (не привязаны к машине)
          </h3>
          <GeneralExpensesPageClient initialExpenses={generalDtos} />
        </div>
      )}
    </div>
  );
}
