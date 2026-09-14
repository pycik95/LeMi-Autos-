"use client";

import { useState } from "react";
import type { GeneralExpenseDTO, GeneralExpenseCategory } from "@/lib/types";
import { GENERAL_EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import { formatEUR } from "@/lib/format";

const inputCls =
  "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

type NewExpenseState = {
  title: string;
  category: GeneralExpenseCategory;
  amount: string;
  vatAmount: string;
  date: string;
  invoiceNumber: string;
  filePath: string;
  note: string;
};

const blankNew: NewExpenseState = {
  title: "",
  category: "OTHER",
  amount: "",
  vatAmount: "",
  date: "",
  invoiceNumber: "",
  filePath: "",
  note: "",
};

export default function GeneralExpenseTable({
  expenses,
  onExpensesChange,
}: {
  expenses: GeneralExpenseDTO[];
  onExpensesChange: (expenses: GeneralExpenseDTO[]) => void;
}) {
  const [draft, setDraft] = useState<NewExpenseState>(blankNew);
  const [adding, setAdding] = useState(false);

  async function addExpense() {
    if (!draft.title.trim() && !draft.amount) return;
    setAdding(true);
    try {
      const fileName = draft.filePath ? draft.filePath.split("/").pop() : undefined;
      const res = await fetch(`/api/general-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, fileName }),
      });
      if (res.ok) {
        const created: GeneralExpenseDTO = await res.json();
        onExpensesChange([created, ...expenses]);
        setDraft(blankNew);
      }
    } finally {
      setAdding(false);
    }
  }

  async function updateExpense(id: string, patch: Partial<GeneralExpenseDTO>) {
    onExpensesChange(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    await fetch(`/api/general-expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteExpense(id: string) {
    onExpensesChange(expenses.filter((e) => e.id !== id));
    await fetch(`/api/general-expenses/${id}`, { method: "DELETE" });
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const totalVat = expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Общие расходы</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-medium w-[200px]">Название</th>
              <th className="px-4 py-2 font-medium w-[170px]">Категория</th>
              <th className="px-4 py-2 font-medium text-right w-[110px]">Сумма, €</th>
              <th className="px-4 py-2 font-medium text-right w-[110px]">Из них НДС, €</th>
              <th className="px-4 py-2 font-medium w-[140px]">Дата</th>
              <th className="px-4 py-2 font-medium w-[130px]">№ счёта</th>
              <th className="px-4 py-2 font-medium w-[220px]">Путь к файлу в архиве</th>
              <th className="px-4 py-2 font-medium w-[140px]">Заметка</th>
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
                      updateExpense(e.id, { category: ev.target.value as GeneralExpenseCategory })
                    }
                  >
                    {Object.entries(GENERAL_EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
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
                    defaultValue={e.filePath ?? ""}
                    onBlur={(ev) =>
                      updateExpense(e.id, {
                        filePath: ev.target.value || null,
                        fileName: ev.target.value ? ev.target.value.split("/").pop() ?? null : null,
                      })
                    }
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
                  onChange={(ev) =>
                    setDraft({ ...draft, category: ev.target.value as GeneralExpenseCategory })
                  }
                >
                  {Object.entries(GENERAL_EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
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
                  onChange={(ev) => setDraft({ ...draft, amount: ev.target.value })}
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
                  placeholder="2026/Q3/.../Rechnungen/...pdf"
                  value={draft.filePath}
                  onChange={(ev) => setDraft({ ...draft, filePath: ev.target.value })}
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
          Сумма: <b className="text-slate-700">{formatEUR(totalAmount)}</b>
        </span>
        <span>
          Входящий НДС: <b className="text-slate-700">{formatEUR(totalVat)}</b>
        </span>
      </div>
    </div>
  );
}
