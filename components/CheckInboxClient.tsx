"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEUR, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import type { CarDTO, GeneralExpenseDTO, ExpenseDTO } from "@/lib/types";

type CarItem = Pick<CarDTO, "id" | "make" | "model" | "vin" | "status" | "checkRunId">;
type ExpenseItem = ExpenseDTO & { carMake: string; carModel: string; carId: string };

export default function CheckInboxClient({
  initialCars,
  initialGeneralExpenses,
  initialExpenses,
}: {
  initialCars: CarItem[];
  initialGeneralExpenses: GeneralExpenseDTO[];
  initialExpenses: ExpenseItem[];
}) {
  const [cars, setCars] = useState(initialCars);
  const [generalExpenses, setGeneralExpenses] = useState(initialGeneralExpenses);
  const [expenses, setExpenses] = useState(initialExpenses);

  // Подтвердить — снимает checkRunId, запись начинает считаться в дашборде/отчётах/НДС.
  // dismiss-check заодно подтверждает и расходы этой же машины (напр. аукционные сборы).
  async function confirmCar(id: string) {
    setCars((prev) => prev.filter((c) => c.id !== id));
    setExpenses((prev) => prev.filter((e) => e.carId !== id));
    await fetch(`/api/cars/${id}/dismiss-check`, { method: "POST" });
  }

  async function confirmGeneral(id: string) {
    setGeneralExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/general-expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkRunId: null }),
    });
  }

  async function confirmExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkRunId: null }),
    });
  }

  // Удалить — полностью убирает запись (и, для машины, файлы вложений/расходы/документы) из базы.
  async function deleteCar(id: string, label: string) {
    if (!confirm(`Удалить машину ${label} насовсем? Это необратимо.`)) return;
    setCars((prev) => prev.filter((c) => c.id !== id));
    setExpenses((prev) => prev.filter((e) => e.carId !== id)); // каскадно удалится и на сервере
    await fetch(`/api/cars/${id}`, { method: "DELETE" });
  }

  async function deleteGeneral(id: string, label: string) {
    if (!confirm(`Удалить запись «${label}» насовсем?`)) return;
    setGeneralExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/general-expenses/${id}`, { method: "DELETE" });
  }

  async function deleteExpense(id: string, label: string) {
    if (!confirm(`Удалить расход «${label}» насовсем?`)) return;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  }

  const total = cars.length + generalExpenses.length + expenses.length;

  if (total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl py-10 text-center text-slate-400 text-sm">
        Пусто — сейчас нет записей, ожидающих подтверждения.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cars.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Машины ({cars.length})</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {cars.map((c) => (
              <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Link href={`/cars/${c.id}`} className="text-slate-900 hover:underline truncate">
                    {c.make} {c.model}
                  </Link>
                  <span className="text-xs text-slate-400 font-mono">{c.vin}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => deleteCar(c.id, `${c.make} ${c.model}`)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmCar(c.id)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
                  >
                    Подтвердить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Расходы по машинам ({expenses.length})
            </h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-500 text-xs whitespace-nowrap">
                    {formatDate(e.date)}
                  </span>
                  <Link href={`/cars/${e.carId}`} className="text-slate-900 hover:underline truncate">
                    {e.carMake} {e.carModel}
                  </Link>
                  <span className="text-slate-700 truncate">{e.title}</span>
                  <span className="text-slate-500 font-medium whitespace-nowrap">
                    {formatEUR(e.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => deleteExpense(e.id, e.title)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmExpense(e.id)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
                  >
                    Подтвердить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {generalExpenses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Общие расходы ({generalExpenses.length})
            </h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {generalExpenses.map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-500 text-xs whitespace-nowrap">
                    {formatDate(e.date)}
                  </span>
                  <span className="text-slate-700 truncate">{e.title}</span>
                  <span className="text-slate-500 font-medium whitespace-nowrap">
                    {formatEUR(e.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => deleteGeneral(e.id, e.title)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmGeneral(e.id)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
                  >
                    Подтвердить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
