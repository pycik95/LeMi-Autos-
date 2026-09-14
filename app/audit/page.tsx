import Link from "next/link";
import { runAudit } from "@/lib/audit";
import { formatEUR } from "@/lib/format";

export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  ok,
  children,
}: {
  title: string;
  count: number;
  ok: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {count === 0 ? (
          <span className="text-xs text-emerald-600">{ok}</span>
        ) : (
          <span className="text-xs font-medium text-rose-600">{count}</span>
        )}
      </div>
      {count > 0 && <div className="divide-y divide-slate-50">{children}</div>}
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="px-5 py-2.5 text-sm text-slate-700">{children}</div>
);

export default async function AuditPage() {
  const result = await runAudit();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Аудит базы и архива</h1>
        <p className="text-sm text-slate-500 mt-1">
          Сверка базы данных с файлами на диске — только чтение, ничего не меняет. Запускайте перед
          тем, как отправлять что-либо бухгалтеру.
        </p>
      </div>

      <Section
        title="Файлы в архиве без записи в базе (не обработаны или устарели — напр. сорвавшаяся сделка)"
        count={result.orphanFiles.length}
        ok="все файлы учтены"
      >
        {result.orphanFiles.map((f) => (
          <Row key={f}>{f}</Row>
        ))}
      </Section>

      <Section
        title="Записи в базе, ссылающиеся на несуществующий файл"
        count={result.brokenLinks.length}
        ok="все ссылки рабочие"
      >
        {result.brokenLinks.map((b) => (
          <Row key={b.filePath}>
            <div className="font-medium text-rose-700">{b.filePath}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {b.refs.map((r) => r.label).join("; ")}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Один и тот же файл привязан к нескольким записям (точный дубль)"
        count={result.duplicateFilePaths.length}
        ok="дублей нет"
      >
        {result.duplicateFilePaths.map((d) => (
          <Row key={d.filePath}>
            <div className="font-medium">{d.filePath}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {d.refs.map((r) => `${r.source}: ${r.label}`).join(" | ")}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Похожие записи — та же сумма и дата (низкая уверенность, проверить вручную)"
        count={result.nearDuplicates.length}
        ok="совпадений нет"
      >
        {result.nearDuplicates.map((n, i) => (
          <Row key={i}>
            <div>
              {n.table} · {formatEUR(n.amount)} · {n.date}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {n.rows.map((r) => r.label).join(" | ")}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Продана, но нет закупочной цены (маржа = вся цена продажи — переплата налога)"
        count={result.soldWithoutPurchasePrice.length}
        ok="у всех проданных есть закупка"
      >
        {result.soldWithoutPurchasePrice.map((c) => (
          <Row key={c.vin}>
            <Link href={`/cars`} className="hover:underline">
              {c.make} {c.model}
            </Link>{" "}
            <span className="text-slate-400 text-xs">{c.vin}</span> — продажа{" "}
            {c.salePrice !== null ? formatEUR(c.salePrice) : "—"}
          </Row>
        ))}
      </Section>

      <Section
        title="Статус «Продана», но не указана дата продажи (не попадает НИ В ОДИН отчёт)"
        count={result.soldWithoutSoldAt.length}
        ok="у всех дата есть"
      >
        {result.soldWithoutSoldAt.map((c) => (
          <Row key={c.vin}>
            {c.make} {c.model} <span className="text-slate-400 text-xs">{c.vin}</span>
          </Row>
        ))}
      </Section>

      <Section
        title="Статус не «Продана», но дата продажи указана"
        count={result.notSoldWithSoldAt.length}
        ok="противоречий нет"
      >
        {result.notSoldWithSoldAt.map((c) => (
          <Row key={c.vin}>
            {c.make} {c.model} <span className="text-slate-400 text-xs">{c.vin}</span> — статус{" "}
            {c.status}, дата продажи {c.soldAt}
          </Row>
        ))}
      </Section>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Покрытие НДС по последним кварталам
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-5 py-2 font-medium">Квартал</th>
              <th className="px-5 py-2 font-medium text-right">Общие расходы: с НДС / всего</th>
              <th className="px-5 py-2 font-medium text-right">Расходы по машинам: с НДС / всего</th>
            </tr>
          </thead>
          <tbody>
            {result.vatCaptureByQuarter.map((q) => (
              <tr key={q.quarter} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2 text-slate-700">{q.quarter}</td>
                <td className="px-5 py-2 text-right tabular-nums">
                  {q.generalExpense.withVat} / {q.generalExpense.total}
                  {q.generalExpense.total > 0 && q.generalExpense.withVat / q.generalExpense.total < 0.5 && (
                    <span className="text-rose-600 ml-1">⚠</span>
                  )}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">
                  {q.expense.withVat} / {q.expense.total}
                  {q.expense.total > 0 && q.expense.withVat / q.expense.total < 0.5 && (
                    <span className="text-rose-600 ml-1">⚠</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
