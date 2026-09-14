"use client";

import { useState } from "react";
import type { DocumentDTO, DocumentKind } from "@/lib/types";
import { DOCUMENT_KIND_LABELS } from "@/lib/archive";
import { formatDate } from "@/lib/format";

const inputCls =
  "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

export default function DocumentList({
  carId,
  documents,
  onDocumentsChange,
  archiveRoot,
  suggestedFolder,
}: {
  carId: string;
  documents: DocumentDTO[];
  onDocumentsChange: (docs: DocumentDTO[]) => void;
  archiveRoot: string;
  suggestedFolder: string | null;
}) {
  const [filePath, setFilePath] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addDocument() {
    if (!filePath.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${carId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось добавить документ");
      onDocumentsChange([data, ...documents]);
      setFilePath("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setAdding(false);
    }
  }

  async function updateDocument(id: string, patch: Partial<DocumentDTO>) {
    onDocumentsChange(documents.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteDocument(id: string) {
    onDocumentsChange(documents.filter((d) => d.id !== id));
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Документы в архиве</h3>
      <p className="text-xs text-slate-400 mb-4">
        Ссылки на файлы в папке архива на диске. Сами файлы не копируются.
        <br />
        Корень архива: <code className="text-slate-500">{archiveRoot}</code>
      </p>

      {documents.length > 0 && (
        <ul className="divide-y divide-slate-100 mb-4">
          {documents.map((d) => (
            <li key={d.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{d.fileName}</div>
                  <div
                    className="text-xs text-slate-400 truncate"
                    title={`${archiveRoot}\\${d.filePath.replace(/\//g, "\\")}`}
                  >
                    {d.filePath}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className={inputCls + " w-56"}
                    value={d.kind}
                    onChange={(e) =>
                      updateDocument(d.id, { kind: e.target.value as DocumentKind })
                    }
                  >
                    {Object.entries(DOCUMENT_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400 w-20 text-right">
                    {formatDate(d.issuedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteDocument(d.id)}
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    Убрать
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder={
            suggestedFolder
              ? `${suggestedFolder}/Ankauf COS ... .pdf`
              : "2026/Q3/Juli/Rechnungen/Ankauf COS A4 2397.pdf"
          }
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDocument();
            }
          }}
        />
        <button
          type="button"
          onClick={addDocument}
          disabled={adding}
          className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          + Добавить
        </button>
      </div>

      {suggestedFolder && (
        <p className="text-xs text-slate-400 mt-2">
          Папка по дате счёта: <code className="text-slate-500">{suggestedFolder}</code>
        </p>
      )}
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      {documents.length === 0 && !error && (
        <p className="text-xs text-slate-400 mt-2">Документы пока не привязаны</p>
      )}
    </div>
  );
}
