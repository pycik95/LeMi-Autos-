"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { DOCUMENT_KIND_LABELS } from "@/lib/archive";
import { CAR_SOURCE_LABELS } from "@/lib/finance";
import type { CarSource, DocumentKind } from "@/lib/types";

interface ScannedFile {
  filePath: string;
  fileName: string;
  kind: DocumentKind;
}

interface ScannedCar {
  key: string;
  source: CarSource;
  identifier: string;
  model: string;
  folder: string;
  files: ScannedFile[];
  existingCarId: string | null;
  existingCarLabel: string | null;
}

interface ScanData {
  archiveRoot: string;
  totalFiles: number;
  cars: ScannedCar[];
  unmatched: { filePath: string; fileName: string }[];
  unmatchedCount: number;
}

interface ApplyResult {
  carsCreated: number;
  carsMatched: number;
  documentsCreated: number;
  documentsSkipped: number;
  errors: string[];
}

export default function ImportPage() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    fetch("/api/import/scan")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Ошибка сканирования");
        return d;
      })
      .then((d: ScanData) => {
        setData(d);
        // По умолчанию отмечаем всё, что ещё не в базе
        setSelected(new Set(d.cars.filter((c) => !c.existingCarId).map((c) => c.key)));
      })
      .catch((e) => setScanError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runImport() {
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: Array.from(selected) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ошибка импорта");
      setResult(d);
      // Перечитываем — часть машин теперь уже в базе
      const rescan = await (await fetch("/api/import/scan")).json();
      setData(rescan);
      setSelected(new Set());
    } catch (e) {
      setResult({
        carsCreated: 0,
        carsMatched: 0,
        documentsCreated: 0,
        documentsSkipped: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-sm text-slate-400">
        Сканирую архив…
      </div>
    );
  }

  if (scanError) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">Импорт из архива</h1>
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {scanError}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Путь к архиву задаётся переменной <code>ARCHIVE_ROOT</code> в файле <code>.env</code>.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const newCars = data.cars.filter((c) => !c.existingCarId);
  const knownCars = data.cars.filter((c) => c.existingCarId);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Импорт из архива</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data.archiveRoot} · файлов: {data.totalFiles} · распознано машин: {data.cars.length}
        </p>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-6 text-xs text-slate-600 space-y-1">
        <p>
          Импорт создаёт <b>заготовки машин</b> и привязывает к ним документы. Файлы остаются в
          архиве, копий не делается.
        </p>
        <p>
          В именах файлов нет VIN, цен и дат — они остаются пустыми, VIN подставляется как заглушка
          (<code>COS-1726</code>). Заполнить их можно из счёта: кнопка «Распознать данные» на карточке.
        </p>
      </div>

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 mb-6 text-sm ${
            result.errors.length
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div>
            Создано машин: <b>{result.carsCreated}</b> · привязано к существующим:{" "}
            <b>{result.carsMatched}</b> · документов добавлено: <b>{result.documentsCreated}</b>
            {result.documentsSkipped > 0 && <> · пропущено дублей: {result.documentsSkipped}</>}
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs list-disc pl-5">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={runImport}
          disabled={importing || selected.size === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {importing ? "Импортирую…" : `Импортировать выбранное (${selected.size})`}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set(newCars.map((c) => c.key)))}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Выбрать все новые ({newCars.length})
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Снять выбор
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3 font-medium">Модель</th>
              <th className="px-4 py-3 font-medium">Аукцион</th>
              <th className="px-4 py-3 font-medium">Идентификатор</th>
              <th className="px-4 py-3 font-medium">Папка</th>
              <th className="px-4 py-3 font-medium text-right">Файлов</th>
              <th className="px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {[...newCars, ...knownCars].map((c) => (
              <Fragment key={c.key}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(c.key)}
                      onChange={() => toggle(c.key)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-slate-900">{c.model}</td>
                  <td className="px-4 py-2.5 text-slate-500">{CAR_SOURCE_LABELS[c.source]}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{c.identifier}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{c.folder}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(c.key)}
                      className="text-slate-600 hover:text-slate-900 underline"
                    >
                      {c.files.length}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.existingCarId ? (
                      <Link
                        href={`/cars/${c.existingCarId}`}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        уже в базе: {c.existingCarLabel}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">новая</span>
                    )}
                  </td>
                </tr>
                {expanded.has(c.key) && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={7} className="px-4 py-3">
                      <ul className="space-y-1 text-xs">
                        {c.files.map((f) => (
                          <li key={f.filePath} className="flex items-center gap-3">
                            <span className="text-slate-700">{f.fileName}</span>
                            <span className="text-slate-400">
                              {DOCUMENT_KIND_LABELS[f.kind]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowUnmatched((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50"
        >
          <span className="text-sm font-semibold text-slate-900">
            Файлы не по шаблону ({data.unmatchedCount})
          </span>
          <span className="text-xs text-slate-400">
            {showUnmatched ? "скрыть" : "показать"}
          </span>
        </button>
        {showUnmatched && (
          <div className="px-5 py-3 border-t border-slate-200 max-h-96 overflow-y-auto">
            <p className="text-xs text-slate-500 mb-3">
              Эти файлы не подходят под шаблон{" "}
              <code>Ankauf {"{COS|AUTO1}"} {"{Модель}"} {"{ID}"}</code> — привязать их к машине можно
              вручную в блоке «Документы в архиве» на карточке.
            </p>
            <ul className="space-y-0.5 text-xs text-slate-500 font-mono">
              {data.unmatched.map((u) => (
                <li key={u.filePath}>{u.filePath}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
