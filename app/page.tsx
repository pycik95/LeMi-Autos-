import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinance } from "@/lib/finance";
import { carToDTO } from "@/lib/serialize";
import { formatEUR, formatDate } from "@/lib/format";
import { quarterRange, yearRange, monthRange, currentQuarter } from "@/lib/period";
import StatusBadge from "@/components/StatusBadge";
import CheckMailButton from "@/components/CheckMailButton";
import CheckTelegramButton from "@/components/CheckTelegramButton";
import CheckAuctionsButton from "@/components/CheckAuctionsButton";

/** Дашборд всегда считается на лету: цифры зависят от текущей даты и данных в БД. */
export const dynamic = "force-dynamic";

/** Сколько дней вперёд считаем ТЮФ «горящим». */
const TUV_WARNING_DAYS = 60;

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "dark" | "warning";
}) {
  const box =
    tone === "dark"
      ? "bg-slate-900"
      : "bg-white border border-slate-200";
  const labelCls = tone === "dark" ? "text-slate-400" : "text-slate-400";
  const valueCls =
    tone === "dark" ? "text-white" : tone === "warning" ? "text-amber-600" : "text-slate-900";

  return (
    <div className={`${box} rounded-xl p-5`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${labelCls}`}>{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueCls}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const { year, quarter } = currentQuarter();
  const qPeriod = quarterRange(year, quarter);
  const mPeriod = monthRange(now.getFullYear(), now.getMonth() + 1);
  const yPeriod = yearRange(year);

  // checkRunId != null — карточка ещё не подтверждена на /check, в дашборд/отчёты не попадает
  const cars = await prisma.car.findMany({
    where: { checkRunId: null },
    include: { expenses: true, attachments: true, documents: true },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });

  const enriched = cars.map((car) => {
    const dto = carToDTO(car);
    return { car, dto, fin: calculateFinance(dto, dto.expenses ?? []) };
  });

  // --- В наличии и заморожено ---
  const unsold = enriched.filter((e) => e.car.status !== "SOLD");
  const frozen = unsold.reduce((s, e) => s + e.fin.purchasePrice + e.fin.grossExpenses, 0);

  // --- Заработано по периодам (по дате продажи) ---
  function earnedIn(start: Date, end: Date): number {
    return enriched
      .filter(
        (e) =>
          e.car.status === "SOLD" &&
          e.car.soldAt &&
          e.car.soldAt >= start &&
          e.car.soldAt < end
      )
      .reduce((s, e) => s + (e.fin.preTaxIncome ?? 0), 0);
  }
  const earnedMonth = earnedIn(mPeriod.start, mPeriod.end);
  const earnedQuarter = earnedIn(qPeriod.start, qPeriod.end);
  const earnedYear = earnedIn(yPeriod.start, yPeriod.end);

  // --- НДС к уплате за текущий квартал ---
  // Umsatzsteuervoranmeldung: НДС с маржи по продажам квартала − Vorsteuer по счетам квартала.
  const vatOnMarginQuarter = enriched
    .filter(
      (e) =>
        e.car.status === "SOLD" &&
        e.car.soldAt &&
        e.car.soldAt >= qPeriod.start &&
        e.car.soldAt < qPeriod.end
    )
    .reduce((s, e) => s + (e.fin.vatOnMargin ?? 0), 0);

  const inputVatQuarter = await prisma.expense
    .findMany({
      where: { date: { gte: qPeriod.start, lt: qPeriod.end }, checkRunId: null },
      select: { vatAmountCents: true },
    })
    .then((rows) => rows.reduce((s, r) => s + (r.vatAmountCents ?? 0), 0) / 100);

  const vatDueQuarter = vatOnMarginQuarter - inputVatQuarter;

  // --- Срочное ---
  const tuvDeadline = new Date(now.getTime() + TUV_WARNING_DAYS * 24 * 60 * 60 * 1000);
  const tuvSoon = enriched.filter(
    (e) => e.car.status !== "SOLD" && e.car.tuvUntil && e.car.tuvUntil < tuvDeadline
  );
  const soldWithoutPrice = enriched.filter(
    (e) => e.car.status === "SOLD" && e.dto.salePrice === null
  );
  // Ни загруженных сканов, ни ссылок на архив
  const withoutDocs = enriched.filter(
    (e) => e.car.attachments.length === 0 && e.car.documents.length === 0
  );

  const urgentCount = tuvSoon.length + soldWithoutPrice.length + withoutDocs.length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Дашборд</h1>
        <p className="text-sm text-slate-500 mt-1">
          {qPeriod.label} · всего машин: {cars.length}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="В наличии"
          value={String(unsold.length)}
          hint={unsold.length ? `заморожено ${formatEUR(frozen)}` : "нет непроданных машин"}
        />
        <StatCard
          label="Доход до налога за месяц"
          value={formatEUR(earnedMonth)}
          hint={`по машинам, ${mPeriod.label}`}
        />
        <StatCard
          label={`Доход до налога за ${qPeriod.label}`}
          value={formatEUR(earnedQuarter)}
          hint={`по машинам, за год: ${formatEUR(earnedYear)}`}
        />
        <StatCard
          label={`НДС к уплате ${qPeriod.label}`}
          value={formatEUR(vatDueQuarter)}
          hint="приблизительно, только по машинам — точный расчёт на /report"
          tone="dark"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Срочное</h3>
          {urgentCount === 0 && <span className="text-xs text-emerald-600">всё в порядке</span>}
        </div>

        {urgentCount === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Ничего не требует внимания</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tuvSoon.length > 0 && (
              <div className="px-5 py-4">
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
                  ТЮФ истёк или истекает в ближайшие {TUV_WARNING_DAYS} дней ({tuvSoon.length})
                </div>
                <ul className="space-y-1.5">
                  {tuvSoon.map(({ car }) => {
                    const expired = car.tuvUntil! < now;
                    return (
                      <li key={car.id} className="flex items-center gap-3 text-sm">
                        <Link href={`/cars/${car.id}`} className="text-slate-900 hover:underline">
                          {car.make} {car.model}
                        </Link>
                        <StatusBadge status={car.status} />
                        <span className={expired ? "text-rose-600" : "text-amber-600"}>
                          {expired ? "истёк" : "до"} {formatDate(car.tuvUntil)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {soldWithoutPrice.length > 0 && (
              <div className="px-5 py-4">
                <div className="text-xs font-medium text-rose-600 uppercase tracking-wide mb-2">
                  Продана, но не указана цена продажи ({soldWithoutPrice.length})
                </div>
                <ul className="space-y-1.5">
                  {soldWithoutPrice.map(({ car }) => (
                    <li key={car.id} className="text-sm">
                      <Link href={`/cars/${car.id}`} className="text-slate-900 hover:underline">
                        {car.make} {car.model}
                      </Link>
                      <span className="text-slate-400 text-xs ml-2">{car.vin}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {withoutDocs.length > 0 && (
              <div className="px-5 py-4">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Без документов ({withoutDocs.length})
                </div>
                <ul className="space-y-1.5">
                  {withoutDocs.map(({ car }) => (
                    <li key={car.id} className="flex items-center gap-3 text-sm">
                      <Link href={`/cars/${car.id}`} className="text-slate-900 hover:underline">
                        {car.make} {car.model}
                      </Link>
                      <StatusBadge status={car.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <Link
          href="/cars"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Список машин
        </Link>
        <Link
          href="/cars/new"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          + Добавить машину
        </Link>
        <CheckMailButton />
        <CheckTelegramButton />
        <CheckAuctionsButton />
      </div>
    </div>
  );
}
