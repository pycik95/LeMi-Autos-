"use client";

import { useState } from "react";
import type { ExpenseDTO, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import { formatEUR } from "@/lib/format";

const inputCls =
  "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

type NewExpenseState = {
  title: string;
  category: ExpenseCategory;
  amount: string;
  vatAmount: string;
  date: string;
  invoiceNumber: string;
  note: string;
};

const blankNew: NewExpenseState = {
  title: "",
  category: "OTHER",
  amount: "",
  vatAmount: "",
  date: "",
  invoiceNumber: "",
  note: "",
};

// ТЮФ считается официальной услугой: НДС по умолчанию = сумма × 19/119.
// Всё равно брать точную сумму из счёта, если она известна — это только подсказка.
function suggestVat(amount: string, category: ExpenseCategory): string {
  const n = Number(amount);
  if (category !== "TUV" || !Number.isFinite(n) || n <= 0) return "";
  return ((n * 19) / 119).toFixed(2);
}

export default function ExpenseTable({
  carId,
  expenses,
  onExpensesChange,
}: {
  carId: string;
  expenses: ExpenseDTO[];
  onExpensesChange: (expenses: ExpenseDTO[]) => void;
}) {
  const [draft, setDraft] = useState<NewExpenseState>(blankNew);
  const [adding, setAdding] = useState(false);

  async function addExpense() {
    if (!draft.title.trim() && !draft.amount) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/cars/${carId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        const created: ExpenseDTO = await res.json();
        onExpensesChange([created, ...expenses]);
        setDraft(blankNew);
      }
    } finally {
      setAdding(false);
    }
  }

  async function updateExpense(id: string, patch: Partial<ExpenseDTO>) {
    onExpensesChange(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    await fetch(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteExpense(id: string) {
    onExpensesChange(expenses.filter((e) => e.id !== id));
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const totalVat = expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Расходы</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1040px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-medium w-[180px]">Название</th>
              <th className="px-4 py-2 font-medium w-[160px]">Категория</th>
              <th className="px-4 py-2 font-medium text-right w-[110px]">Сумма, €</th>
              <th className="px-4 py-2 font-medium text-right w-[110px]">Из них НДС, €</th>
              <th className="px-4 py-2 font-medium w-[160px]">Дата</th>
              <th className="px-4 py-2 font-medium w-[140px]">№ счёта</th>
              <th className="px-4 py-2 font-medium w-[160px]">Заметка</th>
              <th className="px-4 py-2 w-[70px]"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-1.5">
                  <input
                    className={inputCls}
                    defaultValue={e.title}
                    onBlur={(ev) => updateExpense(e.id, { title: ev.target.value })}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <select
                    className={inputCls}
                    defaultValue={e.category}
                    onChange={(ev) =>
                      updateExpense(e.id, { category: ev.target.value as ExpenseCategory })
                    }
                  >
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls + " text-right"}
                    defaultValue={e.amount}
                    onBlur={(ev) => updateExpense(e.id, { amount: Number(ev.target.value) || 0 })}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls + " text-right"}
                    defaultValue={e.vatAmount ?? ""}
                    onBlur={(ev) =>
                      updateExpense(e.id, {
                        vatAmount: ev.target.value === "" ? null : Number(ev.target.value),
                      })
                    }
                  />
                </td>
                <td className="px-4 py-1.5">
                  <input
                    type="date"
                    className={inputCls}
                    defaultValue={e.date ? e.date.slice(0, 10) : ""}
                    onBlur={(ev) => updateExpense(e.id, { date: ev.target.value || null })}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <input
                    className={inputCls}
                    defaultValue={e.invoiceNumber ?? ""}
                    onBlur={(ev) => updateExpense(e.id, { invoiceNumber: ev.target.value })}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <input
                    className={inputCls}
                    defaultValue={e.note ?? ""}
                    onBlur={(ev) => updateExpense(e.id, { note: ev.target.value })}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <button
                    type="button"
                    onClick={() => deleteExpense(e.id)}
                    className="text-slate-400 hover:text-rose-600 text-xs"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}

            <tr className="bg-slate-50/50">
              <td className="px-4 py-1.5">
                <input
                  className={inputCls}
                  placeholder="Новый расход"
                  value={draft.title}
                  onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
                />
              </td>
              <td className="px-4 py-1.5">
                <select
                  className={inputCls}
                  value={draft.category}
                  onChange={(ev) => {
                    const category = ev.target.value as ExpenseCategory;
                    setDraft({
                      ...draft,
                      category,
                      vatAmount: draft.vatAmount || suggestVat(draft.amount, category),
                    });
                  }}
                >
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-1.5">
                <input
                  type="number"
                  step="0.01"
                  className={inputCls + " text-right"}
                  value={draft.amount}
                  onChange={(ev) => {
                    const amount = ev.target.value;
                    setDraft({
                      ...draft,
                      amount,
                      vatAmount: draft.vatAmount || suggestVat(amount, draft.category),
                    });
                  }}
                />
              </td>
              <td className="px-4 py-1.5">
                <input
                  type="number"
                  step="0.01"
                  className={inputCls + " text-right"}
                  value={draft.vatAmount}
                  onChange={(ev) => setDraft({ ...draft, vatAmount: ev.target.value })}
                />
              </td>
              <td className="px-4 py-1.5">
                <input
                  type="date"
                  className={inputCls}
                  value={draft.date}
                  onChange={(ev) => setDraft({ ...draft, date: ev.target.value })}
                />
              </td>
              <td className="px-4 py-1.5">
                <input
                  className={inputCls}
                  value={draft.invoiceNumber}
                  onChange={(ev) => setDraft({ ...draft, invoiceNumber: ev.target.value })}
                />
              </td>
              <td className="px-4 py-1.5">
                <input
                  className={inputCls}
                  value={draft.note}
                  onChange={(ev) => setDraft({ ...draft, note: ev.target.value })}
                />
              </td>
              <td className="px-4 py-1.5">
                <button
                  type="button"
                  onClick={addExpense}
                  disabled={adding}
                  className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-xs hover:bg-slate-700 disabled:opacity-50"
                >
                  + Добавить
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap gap-6 text-xs text-slate-500">
        <span>
          Расходы брутто: <b className="text-slate-700">{formatEUR(totalAmount)}</b>
        </span>
        <span>
          Входящий НДС: <b className="text-slate-700">{formatEUR(totalVat)}</b>
        </span>
      </div>
    </div>
  );
}
