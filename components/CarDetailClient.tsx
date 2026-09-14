"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CarFields from "@/components/CarFields";
import FinancePanel from "@/components/FinancePanel";
import ExpenseTable from "@/components/ExpenseTable";
import FileDropzone from "@/components/FileDropzone";
import DocumentList from "@/components/DocumentList";
import PrivateEntriesPanel from "@/components/PrivateEntriesPanel";
import StatusBadge from "@/components/StatusBadge";
import KleinanzeigenExport from "@/components/KleinanzeigenExport";
import {
  carToFormState,
  formStateToFinanceInput,
  formStateToCarDTO,
  type CarFormState,
} from "@/lib/carForm";
import {
  applyExtractedFields,
  invoiceFieldsToExpensePayload,
} from "@/lib/applyExtractedFields";
import type { CarDTO, ExpenseDTO, AttachmentDTO, DocumentDTO, PrivateEntryDTO } from "@/lib/types";

export default function CarDetailClient({
  car: initialCar,
  archiveRoot,
  suggestedFolder,
}: {
  car: CarDTO;
  archiveRoot: string;
  suggestedFolder: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<CarFormState>(carToFormState(initialCar));
  const [expenses, setExpenses] = useState<ExpenseDTO[]>(initialCar.expenses ?? []);
  const [attachments, setAttachments] = useState<AttachmentDTO[]>(initialCar.attachments ?? []);
  const [documents, setDocuments] = useState<DocumentDTO[]>(initialCar.documents ?? []);
  const [privateEntries, setPrivateEntries] = useState<PrivateEntryDTO[]>(
    initialCar.privateEntries ?? []
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleChange<K extends keyof CarFormState>(field: K, value: CarFormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${initialCar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось сохранить");
      }
      setMessage("Сохранено");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Удалить машину ${initialCar.make} ${initialCar.model}? Это действие необратимо.`)) {
      return;
    }
    setDeleting(true);
    try {
      await fetch(`/api/cars/${initialCar.id}`, { method: "DELETE" });
      router.push("/cars");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExtract(attachmentId: string) {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${initialCar.id}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось распознать данные");
      }
      const fields = data.fields as Record<string, unknown>;

      if (data.documentType === "invoice") {
        // На карточке уже существующей машины счёт всегда добавляется как расход —
        // закупочную цену/пробег в этом моменте меняют вручную, а не автоматически.
        const payload = invoiceFieldsToExpensePayload(fields);
        const expRes = await fetch(`/api/cars/${initialCar.id}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!expRes.ok) {
          throw new Error("Не удалось добавить расход из распознанных данных");
        }
        const created: ExpenseDTO = await expRes.json();
        setExpenses((prev) => [created, ...prev]);
        setMessage("Счёт распознан и добавлен в расходы — проверьте категорию и сумму");
      } else {
        setState((prev) => applyExtractedFields(prev, fields));
        setMessage("Данные техпаспорта распознаны — проверьте поля и нажмите «Сохранить»");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка распознавания");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/cars" className="text-sm text-slate-500 hover:text-slate-700">
            ← Машины
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {initialCar.make} {initialCar.model}
            </h1>
            <StatusBadge status={state.status} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-emerald-600">{message}</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <KleinanzeigenExport car={formStateToCarDTO(state, initialCar)} />
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            Удалить
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <CarFields state={state} onChange={handleChange} />
          </div>

          <ExpenseTable carId={initialCar.id} expenses={expenses} onExpensesChange={setExpenses} />

          <FileDropzone
            carId={initialCar.id}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onExtract={handleExtract}
            extracting={extracting}
          />

          <DocumentList
            carId={initialCar.id}
            documents={documents}
            onDocumentsChange={setDocuments}
            archiveRoot={archiveRoot}
            suggestedFolder={suggestedFolder}
          />
        </div>

        <div className="sticky top-20 space-y-4">
          <FinancePanel car={formStateToFinanceInput(state)} expenses={expenses} />
          <PrivateEntriesPanel
            carId={initialCar.id}
            entries={privateEntries}
            onEntriesChange={setPrivateEntries}
          />
        </div>
      </div>
    </div>
  );
}
