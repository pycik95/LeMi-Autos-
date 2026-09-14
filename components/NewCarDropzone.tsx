"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

export interface PendingFile {
  id: string;
  file: File;
  kind: string;
}

const KIND_LABELS: Record<string, string> = {
  zb1: "Техпаспорт (ZB I)",
  invoice: "Счёт",
  other: "Другое",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function NewCarDropzone({
  files,
  onFilesChange,
  onExtract,
  extractingId,
}: {
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
  onExtract: (pending: PendingFile) => void;
  extractingId: string | null;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const added: PendingFile[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: "zb1",
      }));
      onFilesChange([...files, ...added]);
    },
    [files, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  function updateKind(id: string, kind: string) {
    onFilesChange(files.map((f) => (f.id === id ? { ...f, kind } : f)));
  }

  function removeFile(id: string) {
    onFilesChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Вложения</h3>
      <p className="text-xs text-slate-400 mb-3">
        Перетащите скан техпаспорта или счёт — можно сразу распознать данные и заполнить форму ниже
      </p>

      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-slate-500">
          {isDragActive ? "Отпустите файлы здесь" : "Перетащите файлы сюда или нажмите для выбора"}
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG — техпаспорт и счета</p>
      </div>

      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="text-slate-800 truncate">{f.file.name}</div>
                <div className="text-xs text-slate-400">{formatSize(f.file.size)}</div>
              </div>
              <select
                value={f.kind}
                onChange={(e) => updateKind(f.id, e.target.value)}
                className="text-xs rounded-md border border-slate-300 px-2 py-1 shrink-0"
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {(f.file.type.startsWith("image/") || f.file.type === "application/pdf") && (
                <button
                  type="button"
                  onClick={() => onExtract(f)}
                  disabled={extractingId !== null}
                  className="text-xs text-slate-600 hover:text-slate-900 underline disabled:opacity-50 shrink-0"
                >
                  {extractingId === f.id ? "Распознаём..." : "Распознать данные"}
                </button>
              )}
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="text-xs text-slate-400 hover:text-rose-600 shrink-0"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
