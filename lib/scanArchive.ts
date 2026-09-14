import { readdir } from "fs/promises";
import path from "path";
import {
  ARCHIVE_ROOT,
  IDENTIFIER_RE,
  kindFromFileName,
  normalizeArchivePath,
} from "@/lib/archive";
import type { CarSource, DocumentKind } from "@/lib/types";

/** Суффиксы имени файла — длинные первыми, иначе "BNPL Gebühr" не отделится. */
const KNOWN_SUFFIXES = [
  "BNPL Gebühr",
  "Vermittlungsgebühr",
  "Fahrzeugschein",
  "Transport",
  "Main",
  "ZBI",
];

/**
 * Марки, которые встречаются в именах файлов. В части имён марка есть
 * ("Kia Sorento", "Ford Kuga"), в части — только модель ("Golf IV", "A4").
 */
const KNOWN_MAKES = [
  "Mercedes-Benz",
  "Mercedes",
  "Volkswagen",
  "VW",
  "BMW",
  "Audi",
  "Opel",
  "Ford",
  "Skoda",
  "Škoda",
  "Seat",
  "Renault",
  "Peugeot",
  "Citroen",
  "Citroën",
  "Toyota",
  "Nissan",
  "Mazda",
  "Kia",
  "Hyundai",
  "Volvo",
  "Fiat",
  "Chrysler",
  "Dacia",
  "Mitsubishi",
  "Honda",
  "Suzuki",
];

const MAKE_ALIASES: Record<string, string> = {
  VW: "Volkswagen",
  Mercedes: "Mercedes-Benz",
  "Škoda": "Skoda",
  "Citroën": "Citroen",
};

/** Отделяет марку от модели, если марка указана в имени файла. */
export function splitMakeModel(raw: string): { make: string; model: string } {
  for (const make of KNOWN_MAKES) {
    const re = new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(.+)$`, "i");
    const m = raw.match(re);
    if (m) return { make: MAKE_ALIASES[make] ?? make, model: m[1].trim() };
  }
  return { make: "", model: raw };
}

export type ParsedFile = {
  /** Путь относительно корня архива. */
  filePath: string;
  fileName: string;
  source: CarSource;
  /** COS — последние 4 цифры VIN; AUTO1 — номер лота. */
  identifier: string;
  model: string;
  kind: DocumentKind;
  /** Папка вида "2026/Q3/Juli" — период, к которому подшит документ. */
  folder: string;
};

export type ScannedCar = {
  key: string;
  source: CarSource;
  identifier: string;
  /** Самое длинное встреченное название модели — обычно самое информативное. */
  model: string;
  folder: string;
  files: ParsedFile[];
};

export type ScanResult = {
  archiveRoot: string;
  cars: ScannedCar[];
  /** Файлы, не подходящие под шаблон именования, — импортировать нельзя. */
  unmatched: { filePath: string; fileName: string }[];
  totalFiles: number;
};

/**
 * Разбирает имя вида `Ankauf {COS|AUTO1} {Модель} {ID}[ {суффикс}].{ext}` (раздел 6 ТЗ).
 * Возвращает null, если имя не подходит под шаблон.
 */
export function parseFileName(
  fileName: string
): { source: CarSource; identifier: string; model: string; kind: DocumentKind } | null {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length).trim();

  const m = base.match(/^Ankauf\s+(COS|AUTO1)\s+(.+)$/i);
  if (!m) return null;

  const source: CarSource = m[1].toUpperCase() === "COS" ? "CAR_ON_SALE" : "AUTO1";
  let rest = m[2].trim();

  // Отрезаем известный суффикс с конца. Пробел перед суффиксом необязателен —
  // в архиве встречаются файлы вида "...6772Transport.pdf" без пробела.
  for (const suffix of KNOWN_SUFFIXES) {
    const re = new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (re.test(rest)) {
      rest = rest.replace(re, "").trim();
      break;
    }
  }

  // Последний токен — идентификатор: 4 цифры (COS) либо буквы+цифры (AUTO1)
  const tokens = rest.split(/\s+/);
  const identifier = tokens.pop() ?? "";
  const model = tokens.join(" ").trim();

  if (!identifier || !IDENTIFIER_RE.test(identifier) || !model) return null;

  return { source, identifier, model, kind: kindFromFileName(fileName) };
}

async function walk(dir: string, rootLen: number): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, rootLen)));
    else if (/\.(pdf|jpe?g|png)$/i.test(e.name)) out.push(full.slice(rootLen + 1));
  }
  return out;
}

export async function scanArchive(): Promise<ScanResult> {
  const relPaths = await walk(ARCHIVE_ROOT, ARCHIVE_ROOT.length);

  const byKey = new Map<string, ScannedCar>();
  const unmatched: { filePath: string; fileName: string }[] = [];

  for (const rel of relPaths) {
    const filePath = normalizeArchivePath(rel);
    const fileName = path.basename(filePath);
    const parsed = parseFileName(fileName);

    if (!parsed) {
      unmatched.push({ filePath, fileName });
      continue;
    }

    // "2026/Q3/Juli/Rechnungen/x.pdf" → "2026/Q3/Juli"
    const folder = filePath.split("/").slice(0, 3).join("/");
    const key = `${parsed.source}:${parsed.identifier}`;

    const entry: ParsedFile = { filePath, fileName, folder, ...parsed };
    const existing = byKey.get(key);

    if (existing) {
      existing.files.push(entry);
      // Более длинное название модели обычно точнее ("Golf V Trendline" > "Golf V")
      if (parsed.model.length > existing.model.length) existing.model = parsed.model;
    } else {
      byKey.set(key, {
        key,
        source: parsed.source,
        identifier: parsed.identifier,
        model: parsed.model,
        folder,
        files: [entry],
      });
    }
  }

  const cars = Array.from(byKey.values()).sort((a, b) =>
    a.folder === b.folder ? a.model.localeCompare(b.model) : b.folder.localeCompare(a.folder)
  );

  return {
    archiveRoot: ARCHIVE_ROOT,
    cars,
    unmatched: unmatched.sort((a, b) => a.filePath.localeCompare(b.filePath)),
    totalFiles: relPaths.length,
  };
}
