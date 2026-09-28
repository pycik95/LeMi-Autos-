"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AUCTION_SITES = [
  { key: "cos", label: "CarOnSale", url: "https://app.caronsale.de/salesman/checkout" },
  { key: "auto1", label: "AUTO1", url: "https://www.auto1.com/ru/app/inventory/my-orders/all/1" },
] as const;

export default function CheckAuctionsButton() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({ cos: true, auto1: true });
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    const sites = AUCTION_SITES.filter((s) => selected[s.key]).map((s) => s.key);
    if (sites.length === 0) return;

    for (const site of AUCTION_SITES) {
      if (selected[site.key]) window.open(site.url, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
    setState("running");
    setMessage(null);
    try {
      const res = await fetch("/api/check-auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Ошибка проверки аукционов");
        setState("idle");
        return;
      }
      setMessage(data.summary || "Готово");
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={state === "running"}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {state === "running" ? "Проверяю…" : state === "done" ? "Готово" : "Проверить аукционы"}
      </button>
      {message && <div className="text-xs text-slate-500 mt-1 max-w-xs">{message}</div>}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg z-20">
          <p className="text-xs font-medium text-slate-500 mb-2">Проверить и открыть:</p>
          <div className="flex flex-col gap-2 mb-3">
            {AUCTION_SITES.map((site) => (
              <label key={site.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected[site.key] ?? false}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [site.key]: e.target.checked }))
                  }
                  className="rounded border-slate-300"
                />
                {site.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={!Object.values(selected).some(Boolean)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Открыть и проверить
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
