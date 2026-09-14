/** Периоды для отчётности. Квартал — то, что идёт в Umsatzsteuervoranmeldung. */

export type Period = { start: Date; end: Date; label: string };

/** Квартал по номеру 1..4. end — эксклюзивный (первый день следующего периода). */
export function quarterRange(year: number, quarter: number): Period {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 1),
    label: `Q${quarter} ${year}`,
  };
}

export function yearRange(year: number): Period {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
    label: String(year),
  };
}

export function monthRange(year: number, month: number): Period {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
    label: `${String(month).padStart(2, "0")}.${year}`,
  };
}

export function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

export function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: quarterOf(now) };
}
