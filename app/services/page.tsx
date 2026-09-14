import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { serviceToDTO } from "@/lib/serialize";
import { quarterRange, yearRange, currentQuarter } from "@/lib/period";
import ServicesPageClient from "@/components/ServicesPageClient";

const selectCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const sp = await searchParams;
  const fallback = currentQuarter();

  const year = sp.year ? Number(sp.year) : fallback.year;
  const quarter = sp.quarter === "" ? null : sp.quarter ? Number(sp.quarter) : fallback.quarter;
  const period = quarter ? quarterRange(year, quarter) : yearRange(year);

  const services = await prisma.service.findMany({
    where: { date: { gte: period.start, lt: period.end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const dtos = services.map(serviceToDTO);
  const years = Array.from({ length: 5 }, (_, i) => fallback.year - i);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Услуги</h1>
        <p className="text-sm text-slate-500 mt-1">
          {dtos.length} записей за {period.label}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 mb-6" action="/services">
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
        <Link
          href="/services"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Сбросить
        </Link>
      </form>

      <ServicesPageClient initialServices={dtos} />
    </div>
  );
}
