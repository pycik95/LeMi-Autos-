"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TelegramDocRow = {
  id: string;
  status: "PENDING" | "HANGING";
  roleLabel: string;
  summary: string;
  reason: string | null;
  source: string;
};

export default function TelegramDocsClient({ initialDocs }: { initialDocs: TelegramDocRow[] }) {
  const [docs, setDocs] = useState(initialDocs);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function remove(id: string) {
    if (!confirm("Убрать документ из очереди бота? В учёте ничего не изменится.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/telegram-docs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocs((d) => d.filter((x) => x.id !== id));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (docs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl py-6 text-center text-slate-400 text-sm">
        В боте нет документов, ждущих решения
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {docs.map((d) => (
        <div key={d.id} className="flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                  d.status === "PENDING" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"
                }`}
              >
                {d.status === "PENDING" ? "ждёт подтверждения" : "подвешен"}
              </span>
              <span className="text-sm font-medium text-slate-900">{d.roleLabel}</span>
            </div>
            <div className="text-sm text-slate-700 mt-1">{d.summary}</div>
            {d.reason && <div className="text-xs text-orange-700 mt-1">⚠️ {d.reason}</div>}
            <div className="text-xs text-slate-400 mt-1">Файл: {d.source}</div>
          </div>
          <div className="flex shrink-0 gap-3 text-sm">
            <a href={`/api/telegram-docs/${d.id}`} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">
              Открыть файл
            </a>
            <button
              type="button"
              onClick={() => remove(d.id)}
              disabled={busy === d.id}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
