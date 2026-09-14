"use client";

import { useState } from "react";
import type { CarDTO } from "@/lib/types";
import {
  buildListingFields,
  buildListingFeatures,
  buildListingText,
  missingRequiredFields,
} from "@/lib/kleinanzeigen";

export default function KleinanzeigenExport({ car }: { car: CarDTO }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fields = buildListingFields(car);
  const features = buildListingFeatures(car);
  const missing = missingRequiredFields(car);
  const text = buildListingText(car);

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("Не удалось скопировать");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Экспорт для Kleinanzeigen
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="bg-white rounded-xl w-full max-w-3xl my-8 shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Экспорт для Kleinanzeigen</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 text-sm"
          >
            Закрыть
          </button>
        </div>

        <div className="p-5 space-y-5">
          {missing.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div className="text-sm font-medium text-amber-800">
                Не заполнены обязательные поля ({missing.length})
              </div>
              <div className="text-xs text-amber-700 mt-1">{missing.join(", ")}</div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Поля объявления
              </h4>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {fields.map((f) => (
                  <tr key={f.label} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 text-slate-500 w-1/2">
                      {f.label}
                      {f.required && <span className="text-rose-500 ml-1">*</span>}
                    </td>
                    <td
                      className={`py-1.5 text-right ${
                        f.value ? "text-slate-900" : "text-slate-300"
                      }`}
                    >
                      {f.value ?? "не заполнено"}
                      {f.value && (
                        <button
                          type="button"
                          onClick={() => copy(f.value!, f.label)}
                          className="ml-3 text-xs text-slate-400 hover:text-slate-700"
                        >
                          копировать
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {features.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Ausstattung ({features.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Текст целиком
              </h4>
              <button
                type="button"
                onClick={() => copy(text, "весь текст")}
                className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700"
              >
                Копировать всё
              </button>
            </div>
            <pre className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
              {text}
            </pre>
          </div>

          {copied && <div className="text-xs text-emerald-600">Скопировано: {copied}</div>}
        </div>
      </div>
    </div>
  );
}
