import { prisma } from "@/lib/prisma";
import { carToDTO, expenseToDTO, generalExpenseToDTO, checkRunToDTO } from "@/lib/serialize";
import { formatDate } from "@/lib/format";
import CheckInboxClient from "@/components/CheckInboxClient";
import CheckMailButton from "@/components/CheckMailButton";
import CheckTelegramButton from "@/components/CheckTelegramButton";
import CheckAuctionsButton from "@/components/CheckAuctionsButton";
import TelegramDocsClient, { type TelegramDocRow } from "@/components/TelegramDocsClient";
import { docSummary, roleLabel } from "@/lib/bot/cards";
import { parseFields } from "@/lib/bot/shared";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { MAIL: "Почта", AUCTION: "Аукцион", TELEGRAM: "Telegram" };

export default async function CheckPage() {
  const [cars, generalExpenses, expenses, runs, tgDocs] = await Promise.all([
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
    // Пустые проверки Telegram (ни одного сообщения) — просто шум, в истории их не показываем.
    prisma.checkRun.findMany({
      where: { NOT: { kind: "TELEGRAM", itemsFound: 0, summary: { startsWith: "Сообщений: 0" } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Документы из Telegram-бота: ждут «Подтвердить» в чате или «подвешены» (без карточки машины / не хватает данных).
    prisma.telegramDoc.findMany({
      select: { id: true, status: true, role: true, fieldsJson: true, reason: true, fileName: true, pageLabel: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const tgRows: TelegramDocRow[] = tgDocs.map((d) => ({
    id: d.id,
    status: d.status === "PENDING" ? "PENDING" : "HANGING",
    roleLabel: roleLabel(d.role),
    summary: docSummary(parseFields(d.fieldsJson)),
    reason: d.reason,
    source: `${d.fileName}${d.pageLabel ? `, ${d.pageLabel}` : ""}`,
  }));

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

      <div className="flex flex-wrap items-start gap-3 mb-4">
        <CheckMailButton />
        <CheckTelegramButton />
        <CheckAuctionsButton />
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-6 text-xs text-slate-600 space-y-1">
        <p>
          <b>«Проверить почту»</b> — счета из Gmail. <b>«Проверить аукционы»</b> — новые лоты
          CarOnSale/AUTO1: карточка машины и счета (нужен разовый вход через{" "}
          <code>node scripts/auction-login.mjs cos|auto1</code>). <b>«Проверить Telegram»</b> —
          документы, присланные боту (их вы подтверждаете прямо в чате).
        </p>
        <p>
          Ниже — то, что уже найдено и создано, но ещё <b>не подтверждено</b>: в дашборд, список машин,
          расходы и отчёт эти записи пока не попадают. «Подтвердить» — включает запись в общий учёт.
          «Удалить» — убирает насовсем (для машины — вместе с файлами вложений).
        </p>
      </div>

      <h2 className="text-sm font-semibold text-slate-900 mb-3">Требует подтверждения</h2>
      <CheckInboxClient
        // новые записи после проверки → перемонтировать, чтобы список обновился
        key={[...carItems, ...expenseItems, ...generalExpenseItems].map((x) => x.id).join(",")}
        initialCars={carItems}
        initialGeneralExpenses={generalExpenseItems}
        initialExpenses={expenseItems}
      />

      <h2 className="text-sm font-semibold text-slate-900 mt-8 mb-3">Документы в Telegram-боте</h2>
      <p className="text-xs text-slate-500 mb-3">
        Подтверждаются и правятся в чате с ботом. «Подвешенные» ждут карточки машины или недостающих данных — здесь
        их можно посмотреть и открыть файл.
      </p>
      <TelegramDocsClient key={`tg:${tgRows.map((d) => d.id + d.status).join(",")}`} initialDocs={tgRows} />

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
