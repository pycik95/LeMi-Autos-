"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckTelegramButton() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const res = await fetch("/api/check-telegram", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Ошибка проверки Telegram");
        setState("idle");
        return;
      }
      setMessage(data.summary || "Готово");
      setState("done");
      if (data.itemsFound > 0) {
        setTimeout(() => router.refresh(), 1200);
      } else {
        setTimeout(() => setState("idle"), 1500);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {state === "running" ? "Проверяю…" : state === "done" ? "Готово" : "Проверить Telegram"}
      </button>
      {message && <span className="text-xs text-slate-500 mt-1">{message}</span>}
    </div>
  );
}
