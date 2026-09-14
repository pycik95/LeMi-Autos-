"use client";

import { calculateFinance, type CarForCalc, type ExpenseForCalc } from "@/lib/finance";
import { formatEUR } from "@/lib/format";

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className={`text-sm ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>{label}</div>
      <div className={`text-sm tabular-nums ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}>
        {value}
      </div>
    </div>
  );
}

export default function FinancePanel({
  car,
  expenses,
}: {
  car: CarForCalc;
  expenses: ExpenseForCalc[];
}) {
  const fin = calculateFinance(car, expenses);
  const sold = fin.preTaxIncome !== null;
  const positive = (fin.preTaxIncome ?? 0) >= 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        Доход до общих расходов и налога
      </div>
      <div
        className={`text-3xl font-bold mt-1 ${
          !sold ? "text-slate-300" : positive ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {formatEUR(fin.preTaxIncome)}
      </div>
      {!sold && <div className="text-xs text-slate-400 mt-1">машина ещё не продана</div>}

      <div className="mt-5 divide-y divide-slate-100">
        <div className="py-1.5">
          <Row label="Маржа" value={formatEUR(fin.margin)} bold />
        </div>
        <div className="py-1.5">
          <Row label="НДС к уплате" value={formatEUR(fin.vatDue)} />
        </div>
        <div className="pt-1.5">
          <Row label="Доход до общих расходов и налога" value={formatEUR(fin.preTaxIncome)} bold />
        </div>
      </div>

      <details className="mt-4 pt-3 border-t border-dashed border-slate-200">
        <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600">
          Детали расчёта
        </summary>
        <div className="mt-2 text-xs text-slate-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>Закупочная цена</span>
            <span className="tabular-nums">{formatEUR(fin.purchasePrice)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Продажная цена</span>
            <span className="tabular-nums">{formatEUR(fin.salePrice)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>НДС с маржи (19/119)</span>
            <span className="tabular-nums">{formatEUR(fin.vatOnMargin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Расходы брутто</span>
            <span className="tabular-nums">{formatEUR(fin.grossExpenses)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Входящий НДС по расходам</span>
            <span className="tabular-nums">{formatEUR(fin.inputVat)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Расходы нетто</span>
            <span className="tabular-nums">{formatEUR(fin.netExpenses)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>База налога</span>
            <span className="tabular-nums">{formatEUR(fin.taxBase)}</span>
          </div>
        </div>
      </details>
    </div>
  );
}
