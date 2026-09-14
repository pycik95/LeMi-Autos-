"use client";

import { useState } from "react";
import type { PrivateEntryDTO, PrivateEntryKind } from "@/lib/types";
import { formatEUR } from "@/lib/format";

const inputCls =
  "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

type Draft = {
  title: string;
  kind: PrivateEntryKind;
  amount: string;
  date: string;
  note: string;
};

const blankDraft: Draft = { title: "", kind: "INCOME", amount: "", date: "", note: "" };

export default function PrivateEntriesPanel({
  carId,
  entries,
  onEntriesChange,
}: {
  carId: string;
  entries: PrivateEntryDTO[];
  onEntriesChange: (entries: PrivateEntryDTO[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addEntry() {
    if (!draft.title.trim() && !draft.amount) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/private-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, carId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось добавить запись");
        return;
      }
      onEntriesChange([data as PrivateEntryDTO, ...entries]);
      setDraft(blankDraft);
    } finally {
      setAdding(false);
    }
  }

  async function deleteEntry(id: string) {
    onEntriesChange(entries.filter((e) => e.id !== id));
    await fetch(`/api/private-entries/${id}`, { method: "DELETE" });
  }

  const sum = entries.reduce((s, e) => s + (e.kind === "INCOME" ? e.amount : -e.amount), 0);

  return (
    <details className="bg-white border border-slate-200 rounded-xl p-5">
      <summary className="text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-600">
        Доп. услуги
      </summary>

      <div className="mt-3 text-sm text-slate-500">
        Итого: <span className="font-semibold text-slate-900">{formatEUR(sum)}</span>
      </div>

      <div className="mt-3 space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-sm border-b border-slate-50 pb-2">
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                e.kind === "INCOME" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {e.kind === "INCOME" ? "доход" : "расход"}
            </span>
            <span className="flex-1 text-slate-700">{e.title}</span>
            <span className="text-slate-400 text-xs">{e.date ? e.date.slice(0, 10) : ""}</span>
            <span className="tabular-nums font-medium">
              {e.kind === "INCOME" ? "+" : "−"} {formatEUR(e.amount)}
            </span>
            <button
              type="button"
              onClick={() => deleteEntry(e.id)}
              className="text-slate-300 hover:text-rose-600 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          className={inputCls}
          placeholder="Название"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <select
          className={inputCls}
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as PrivateEntryKind })}
        >
          <option value="INCOME">Доход</option>
          <option value="EXPENSE">Расход</option>
        </select>
        <input
          type="number"
          step="0.01"
          className={inputCls}
          placeholder="Сумма, €"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        />
        <input
          type="date"
          className={inputCls}
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <input
          className={inputCls + " col-span-2"}
          placeholder="Заметка"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={addEntry}
        disabled={adding}
        className="mt-2 rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
      >
        + Добавить
      </button>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
    </details>
  );
}
