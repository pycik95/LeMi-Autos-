"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CarStatus } from "@/lib/types";

const OPTIONS: { value: CarStatus; label: string }[] = [
  { value: "IN_STOCK", label: "В наличии" },
  { value: "IN_PREP", label: "В подготовке" },
  { value: "SOLD", label: "Продан" },
];

const STYLES: Record<CarStatus, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-700",
  SOLD: "bg-rose-50 text-rose-700",
  IN_PREP: "bg-orange-50 text-orange-700",
};

export default function InlineStatusSelect({
  carId,
  status,
}: {
  carId: string;
  status: CarStatus;
}) {
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function change(next: CarStatus) {
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/cars/${carId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => change(e.target.value as CarStatus)}
      onClick={(e) => e.stopPropagation()}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border-0 ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50 ${STYLES[value]}`}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
