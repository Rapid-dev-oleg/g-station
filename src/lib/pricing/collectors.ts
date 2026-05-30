/**
 * Подбор цены коллектора по шифру и материалу из реконструированного
 * прайса (`gidrostroy/KNOWLEDGE/tables/коллекторы-цены.md`, 41 точка).
 *
 * Шифр: `Dвсас[/Dнапор]-N[-dвсас[/dнапор]]`, например `200/150-2-125/100`.
 * Цена — «материалы коллектора» (без работ по сварке). Цены имеют разброс
 * 1.5–2× по одному шифру → используем медиану. Нерж ≈ +30 % к углерод.
 *
 * Логика поиска (fallback-каскад):
 *   1) точное совпадение DN-N + материала;
 *   2) точное совпадение DN-N без учёта материала (× коэф. материала);
 *   3) ближайший DN при том же N (× коэф.);
 *   4) null — если совсем нет ориентира.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type CollectorMaterial = 'carbon' | 'stainless' | 'unknown';

interface CollectorPoint {
  signature: string;
  dnSuc: number;
  dnDis?: number;
  n: number;
  pricesRub: number[];
  priceMedianRub: number;
  material: CollectorMaterial;
}

let cachedPoints: CollectorPoint[] | null = null;

function defaultPricesPath(): string {
  return (
    process.env.COLLECTOR_PRICES_FILE ??
    join(process.cwd(), '..', 'gidrostroy', 'KNOWLEDGE', 'tables', 'коллекторы-цены.md')
  );
}

function parsePoints(file: string): CollectorPoint[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch {
    return [];
  }
  const out: CollectorPoint[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('| ') || line.includes('---') || /Шифр/i.test(line)) continue;
    const cols = line
      .split('|')
      .map((s) => s.trim())
      .filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 3) continue;
    const sigCol = cols[0];
    const priceCol = cols[1];
    const matCol = cols[2] ?? '';

    const m = sigCol.match(/^(\d+)(?:\/(\d+))?-(\d+)/);
    if (!m) continue;
    const dnSuc = +m[1];
    const dnDis = m[2] ? +m[2] : undefined;
    const n = +m[3];
    if (!Number.isFinite(dnSuc) || !Number.isFinite(n)) continue;

    const isNerz = /\(\s*нерж/i.test(sigCol) || /нерж/i.test(matCol);
    const isCarbon = /углерод|ст\.?\s*20/i.test(matCol);
    const material: CollectorMaterial = isNerz ? 'stainless' : isCarbon ? 'carbon' : 'unknown';

    const nums = (priceCol.match(/\d[\d\s ]+\d/g) ?? [])
      .map((s) => +s.replace(/[\s ]/g, ''))
      .filter((v) => v >= 10_000 && v <= 5_000_000);
    if (nums.length === 0) continue;
    const sorted = nums.slice().sort((a, b) => a - b);
    const priceMedianRub = sorted[Math.floor(sorted.length / 2)];

    const signature = `${dnSuc}${dnDis ? `/${dnDis}` : ''}-${n}`;
    out.push({ signature, dnSuc, dnDis, n, pricesRub: nums, priceMedianRub, material });
  }
  return out;
}

function loadPoints(): CollectorPoint[] {
  if (cachedPoints) return cachedPoints;
  cachedPoints = parsePoints(defaultPricesPath());
  return cachedPoints;
}

/** Сброс кеша (для тестов / hot-reload md-файла). */
export function resetCollectorPricesCache(): void {
  cachedPoints = null;
}

export interface CollectorPriceResult {
  priceRub: number;
  source: string; // строка для UI: "200/150-2 углерод. (медиана 4 точек)"
  exact: boolean;
}

/**
 * Подбор цены коллектора. `code` — шифр изделия или просто DN-выражение.
 * `material` — свободная строка из items: «Ст.20», «нержавейка» и т.п.
 */
export function findCollectorPrice(
  code: string | undefined | null,
  material?: string | null,
): CollectorPriceResult | null {
  const points = loadPoints();
  if (points.length === 0) return null;
  if (!code) return null;

  const m = code.match(/(\d+)(?:\/(\d+))?[-\s](\d+)/);
  if (!m) return null;
  const dnSuc = +m[1];
  const n = +m[3];
  if (!Number.isFinite(dnSuc) || !Number.isFinite(n)) return null;
  const dnDis = m[2] ? +m[2] : undefined;

  const wantMat: CollectorMaterial = /нерж|stainless/i.test(material ?? '')
    ? 'stainless'
    : 'carbon';
  const adj = wantMat === 'stainless' ? 1.3 : 1; // нерж +30 % к углерод

  const sameDN = points.filter(
    (p) => p.dnSuc === dnSuc && (p.dnDis ?? dnDis) === (dnDis ?? p.dnDis) && p.n === n,
  );
  // 1) точное DN-N + точный материал
  const exactMat = sameDN.filter((p) => p.material === wantMat);
  if (exactMat.length > 0) {
    const med = median(exactMat.map((p) => p.priceMedianRub));
    return {
      priceRub: Math.round(med),
      source: `${exactMat[0].signature} (${matLabel(wantMat)}, ${exactMat.length} точек прайса)`,
      exact: true,
    };
  }
  // 2) точное DN-N, материал unknown/carbon → поправка
  if (sameDN.length > 0) {
    const med = median(sameDN.map((p) => p.priceMedianRub));
    return {
      priceRub: Math.round(med * adj),
      source: `${sameDN[0].signature} (${sameDN.length} точек, поправка на ${matLabel(wantMat)})`,
      exact: false,
    };
  }
  // 3) ближайший DN при том же N
  const nearest = points
    .filter((p) => p.n === n)
    .sort((a, b) => Math.abs(a.dnSuc - dnSuc) - Math.abs(b.dnSuc - dnSuc))[0];
  if (nearest) {
    return {
      priceRub: Math.round(nearest.priceMedianRub * adj),
      source: `≈${nearest.signature} (ближайший DN, поправка на ${matLabel(wantMat)})`,
      exact: false,
    };
  }
  return null;
}

function median(arr: number[]): number {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function matLabel(m: CollectorMaterial): string {
  return m === 'stainless' ? 'нерж' : m === 'carbon' ? 'углерод.' : 'неизв';
}

/**
 * Работа по сварке коллектора (масштаб с диаметром) — нижняя граница
 * диапазона из методички (раздел «Работа по сварке коллектора»).
 */
export function collectorWeldingWorkRub(dnSuc: number): number {
  if (dnSuc <= 65) return 18_000;
  if (dnSuc <= 125) return 25_000;
  if (dnSuc <= 150) return 30_000;
  return 43_000;
}
