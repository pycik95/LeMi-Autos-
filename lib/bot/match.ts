import { prisma } from "@/lib/prisma";
import { normVin, type DocFields } from "./shared";

export type Candidate = { carId: string; vin: string; label: string; why: string };

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9а-я]/g, "");

/**
 * Договор продажи с VIN, которого нет в базе: возможно, VIN прочитан с ошибкой. Ищем среди
 * непроданных машин похожие — по VIN (1–3 расхождения или совпадающий хвост), по марке/модели и пробегу.
 * Это только ПОДСКАЗКА — применяется лишь после нажатия пользователем «Да, это она».
 */
export async function findSimilarCars(f: DocFields): Promise<Candidate[]> {
  const vin = normVin(f.vin);
  const cars = await prisma.car.findMany({
    select: { id: true, vin: true, make: true, model: true, mileageKm: true, status: true, salePriceCents: true, soldAt: true },
  });

  const scored: { c: Candidate; score: number }[] = [];
  for (const car of cars) {
    const carVin = normVin(car.vin);
    if (!carVin) continue;
    const dist = vin ? levenshtein(vin, carVin) : 99;
    const sameTail = !!vin && vin.slice(-6) === carVin.slice(-6);

    const mk = norm(f.make);
    const md = norm(f.model);
    const sameMake = !!mk && norm(car.make) === mk;
    const sameModel = !!md && (norm(car.model).includes(md) || md.includes(norm(car.model)));
    const sameMakeModel = sameMake && sameModel;

    const km = f.mileageKm && car.mileageKm ? Math.abs(f.mileageKm - car.mileageKm) / car.mileageKm : null;
    const closeKm = km !== null && km <= 0.05;

    const reasons: string[] = [];
    if (dist <= 3) reasons.push(`VIN отличается на ${dist} симв.`);
    else if (sameTail) reasons.push("совпадает конец VIN");
    if (sameMakeModel) reasons.push("та же марка/модель");
    if (closeKm) reasons.push("близкий пробег");

    // «Открытая» машина — ещё не продана или продажа не оформлена (нет цены/даты): именно к ней чаще
    // всего приходит договор. Для полностью оформленных продаж берём только почти совпадающий VIN.
    const open = car.status !== "SOLD" || car.salePriceCents == null || !car.soldAt;
    const plausible = open ? dist <= 3 || (sameTail && sameMakeModel) || (sameMakeModel && closeKm) : dist <= 2;
    if (!plausible) continue;

    const score = (dist <= 3 ? 4 - dist : 0) + (sameTail ? 2 : 0) + (sameMakeModel ? 2 : 0) + (closeKm ? 1 : 0);
    scored.push({
      score,
      c: { carId: car.id, vin: carVin, label: `${car.make} ${car.model}`.trim(), why: reasons.join(", ") },
    });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.c);
}
