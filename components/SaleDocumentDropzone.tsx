"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { formatEUR, formatDate } from "@/lib/format";

type Result = {
  fileName: string;
  ok: boolean;
  error?: string;
  carLabel?: string;
  salePrice?: number;
  saleDate?: string;
};

export default function SaleDocumentDropzone() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const router = useRouter();

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      setUploading(true);
      setResults([]);
      try {
        const formData = new FormData();
        accepted.forEach((f) => formData.append("files", f));
        const res = await fetch("/api/cars/sale-document", { method: "POST", body: formData });
        const data = await res.json();
        setResults(data.results ?? []);
        router.refresh();
      } catch (e) {
        setResults([{ fileName: "—", ok: false, error: e instanceof Error ? e.message : String(e) }]);
      } finally {
        setUploading(false);
      }
    },
    [router]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="mb-6">
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed px-4 py-4 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-slate-500">
          {uploading
            ? "Распознаю и заношу…"
            : isDragActive
            ? "Отпустите договор(ы) здесь"
            : "Перетащите договор(ы) продажи сюда — машина определится по VIN автоматически"}
        </p>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-emerald-700" : "text-rose-600"}>
              {r.ok
                ? `✅ ${r.fileName}: ${r.carLabel} — ${formatEUR(r.salePrice ?? null)}, ${formatDate(r.saleDate)}`
                : `❌ ${r.fileName}: ${r.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
