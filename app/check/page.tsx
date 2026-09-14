import { prisma } from "@/lib/prisma";
import { carToDTO, expenseToDTO, generalExpenseToDTO, checkRunToDTO } from "@/lib/serialize";
import { formatDate } from "@/lib/format";
import CheckInboxClient from "@/components/CheckInboxClient";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { MAIL: "Почта", AUCTION: "Аукцион" };

export default async function CheckPage() {
  const [cars, generalExpenses, expenses, runs] = await Promise.all([
    prisma.car.findMany({ where: { checkRunId: { not: null } }, orderBy: { createdAt: "desc" } }),
    prisma.generalExpense.findMany({
      where: { checkRunId: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.expense.findMany({
      where: { checkRunId: { not: null } },
      include: { car: { select: { id: true, make: true, model: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.checkRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const carItems = cars.map((c) => {
    const dto = carToDTO(c);
    return { id: dto.id, make: dto.make, model: dto.model, vin: dto.vin, status: dto.status, checkRunId: dto.checkRunId };
  });
  const expenseItems = expenses.map((e) => ({
    ...expenseToDTO(e),
    carId: e.car.id,
    carMake: e.car.make,
    carModel: e.car.model,
  }));
  const generalExpenseItems = generalExpenses.map(generalExpenseToDTO);
  const runDtos = runs.map(checkRunToDTO);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Проверка почты и аукционов</h1>
        <p className="text-sm text-slate-500 mt-1">
          Записи, которые нужно посмотреть после автопроверки
        </p>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-6 text-xs text-slate-600 space-y-1">
        <p>
          Эта страница не запускается сама — проверку выполняю я (Claude) по вашей просьбе в чате.
        </p>
        <p>
          <b>Почта:</b> просто напишите «проверь почту» — у меня уже есть доступ к вашему Gmail в
          текущей сессии.
        </p>
        <p>
          <b>Аукционы:</b> сначала откройте и залогиньтесь в личный кабинет AUTO1/Copart/COS в
          браузере, затем попросите меня проверить конкретный лот — я зайду в уже открытую вкладку и
          заполню карточку.
        </p>
        <p>Ниже — то, что уже найдено и создано, но ещё не подтверждено.</p>
      </div>

      <h2 className="text-sm font-semibold text-slate-900 mb-3">Требует подтверждения</h2>
      <CheckInboxClient
        initialCars={carItems}
        initialGeneralExpenses={generalExpenseItems}
        initialExpenses={expenseItems}
      />

      <h2 className="text-sm font-semibold text-slate-900 mt-8 mb-3">История проверок</h2>
      {runDtos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-8 text-center text-slate-400 text-sm">
          Проверок ещё не было
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Дата</th>
                <th className="px-5 py-2 font-medium">Тип</th>
                <th className="px-5 py-2 font-medium">Что нашли</th>
                <th className="px-5 py-2 font-medium text-right">Записей</th>
              </tr>
            </thead>
            <tbody>
              {runDtos.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-500 whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-5 py-2 text-slate-700">{KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td className="px-5 py-2 text-slate-700">{r.summary}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{r.itemsFound}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
