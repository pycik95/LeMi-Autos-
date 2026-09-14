"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { AttachmentDTO } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  zb1: "Техпаспорт (ZB I)",
  invoice: "Счёт",
  other: "Другое",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileDropzone({
  carId,
  attachments,
  onAttachmentsChange,
  onExtract,
  extracting,
}: {
  carId: string;
  attachments: AttachmentDTO[];
  onAttachmentsChange: (attachments: AttachmentDTO[]) => void;
  onExtract?: (attachmentId: string) => void;
  extracting?: boolean;
}) {
  const [kind, setKind] = useState("other");
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setUploading(true);
      try {
        const formData = new FormData();
        acceptedFiles.forEach((f) => formData.append("files", f));
        formData.append("kind", kind);

        const res = await fetch(`/api/cars/${carId}/attachments`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const created: AttachmentDTO[] = await res.json();
          onAttachmentsChange([...created, ...attachments]);
        }
      } finally {
        setUploading(false);
      }
    },
    [carId, kind, attachments, onAttachmentsChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  async function deleteAttachment(id: string) {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Вложения</h3>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="text-xs rounded-md border border-slate-300 px-2 py-1"
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-slate-500">
          {uploading
            ? "Загрузка..."
            : isDragActive
            ? "Отпустите файлы здесь"
            : "Перетащите файлы сюда или нажмите для выбора"}
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG</p>
      </div>

      {attachments.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-800 hover:underline truncate block"
                >
                  {a.originalName}
                </a>
                <span className="text-xs text-slate-400">
                  {KIND_LABELS[a.kind ?? "other"] ?? a.kind} · {formatSize(a.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {onExtract && (a.mimeType?.startsWith("image/") || a.mimeType === "application/pdf") && (
                  <button
                    type="button"
                    onClick={() => onExtract(a.id)}
                    disabled={extracting}
                    className="text-xs text-slate-600 hover:text-slate-900 underline disabled:opacity-50"
                  >
                    {extracting ? "Распознаём..." : "Распознать данные"}
                  </button>
                )}
                <a
                  href={`/api/attachments/${a.id}?download=1`}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  Скачать
                </a>
                <button
                  type="button"
                  onClick={() => deleteAttachment(a.id)}
                  className="text-xs text-slate-400 hover:text-rose-600"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
