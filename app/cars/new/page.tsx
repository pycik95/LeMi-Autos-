"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CarFields from "@/components/CarFields";
import FinancePanel from "@/components/FinancePanel";
import NewCarDropzone, { type PendingFile } from "@/components/NewCarDropzone";
import { emptyCarForm, formStateToFinanceInput, type CarFormState } from "@/lib/carForm";
import { applyExtractedFields, applyInvoiceToCarFields } from "@/lib/applyExtractedFields";

export default function NewCarPage() {
  const router = useRouter();
  const [state, setState] = useState<CarFormState>(emptyCarForm);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleChange<K extends keyof CarFormState>(field: K, value: CarFormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function handleExtract(pending: PendingFile) {
    setExtractingId(pending.id);
    setError(null);
    try {
      const documentType = pending.kind === "invoice" ? "invoice" : "zb1";
      const formData = new FormData();
      formData.append("file", pending.file);
      formData.append("documentType", documentType);
      const res = await fetch("/api/extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось распознать данные");
      }
      const fields = data.fields as Record<string, unknown>;
      if (documentType === "invoice") {
        setState((prev) => applyInvoiceToCarFields(prev, fields));
        setMessage("Данные счёта распознаны — проверьте закупочную цену и пробег перед сохранением");
      } else {
        setState((prev) => applyExtractedFields(prev, fields));
        setMessage("Данные техпаспорта распознаны — проверьте поля ниже перед сохранением");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка распознавания");
    } finally {
      setExtractingId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.vin.trim() || !state.make.trim() || !state.model.trim()) {
      setError("Заполните VIN, марку и модель");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось сохранить машину");
      }
      const car = await res.json();

      for (const pending of pendingFiles) {
        const formData = new FormData();
        formData.append("files", pending.file);
        formData.append("kind", pending.kind);
        await fetch(`/api/cars/${car.id}/attachments`, { method: "POST", body: formData });
      }

      router.push(`/cars/${car.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cars" className="text-sm text-slate-500 hover:text-slate-700">
          ← Машины
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Новая машина</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <NewCarDropzone
            files={pendingFiles}
            onFilesChange={setPendingFiles}
            onExtract={handleExtract}
            extractingId={extractingId}
          />

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <CarFields state={state} onChange={handleChange} />

            {message && <div className="text-sm text-emerald-600 mb-4">{message}</div>}
            {error && <div className="text-sm text-rose-600 mb-4">{error}</div>}

            <div className="flex justify-end gap-3">
              <Link
                href="/cars"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Отмена
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Создать машину"}
              </button>
            </div>
          </div>
        </div>

        <div>
          <FinancePanel car={formStateToFinanceInput(state)} expenses={[]} />
          <p className="text-xs text-slate-400 mt-3">Расходы можно будет добавить после создания карточки.</p>
        </div>
      </form>
    </div>
  );
}
