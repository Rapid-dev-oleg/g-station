/**
 * Нормативные таблицы СП как TS-константы —
 * KNOWLEDGE/tables/нормативы-расчёта.md.
 *
 * - объём пожарного запаса V = расход × время;
 * - таблица «расход → DN коллектора» (всас/напор);
 * - группы помещений АУПТ (СП 485 табл. 6.1).
 */

import type { FirePurpose } from '@/lib/dossier/types';

// ─── 1. Время тушения по назначению (СП 8/10/485) ────────────────────────

/**
 * Продолжительность тушения, ч — для объёма пожарного запаса.
 * Наружное ПТ — 3 ч (2 ч для жилых/общественных I–II ст. С0);
 * ВПВ — 1 ч; АУПТ спринклер — 0,5 ч (группа 1) или 1 ч (группы 2+).
 */
export interface FireDurationOpts {
  /** Жилое/общественное здание I–II степени огнестойкости класса С0. */
  residentialC0?: boolean;
  /** Группа помещений АУПТ (1..7) — влияет на время для АУПТ. */
  aуптGroup?: number;
}

export function fireDurationHours(purpose: FirePurpose, opts: FireDurationOpts = {}): number {
  switch (purpose) {
    case 'наружное-ПТ':
      return opts.residentialC0 ? 2 : 3;
    case 'ВПВ':
      return 1;
    case 'АУПТ': {
      // группа 1 — 30 мин; группы 2+ — 60 мин (СП 485 табл. 6.1)
      const g = opts.aуптGroup ?? 1;
      return g <= 1 ? 0.5 : 1;
    }
    default:
      // пожаротушение-общее — консервативно 1 ч
      return 1;
  }
}

/**
 * Объём пожарного запаса воды, м³. V = Q × t, округление вверх.
 * @param qM3h расход тушения, м³/ч
 * @param durationH время тушения, ч
 */
export function fireReserveVolume(qM3h: number, durationH: number): number {
  return Math.ceil(qM3h * durationH);
}

// ─── 2. Группы помещений АУПТ — СП 485.1311500.2020 табл. 6.1 ─────────────

export interface AyptGroupSpec {
  group: number;
  /** Интенсивность орошения водой, л/(с·м²). */
  intensity: number;
  /** Минимальный расход, л/с. */
  minFlowLs: number;
  /** Расчётная площадь, м². */
  areaM2: number;
  /** Время работы, мин. */
  durationMin: number;
}

export const AYPT_GROUPS: AyptGroupSpec[] = [
  { group: 1, intensity: 0.08, minFlowLs: 10, areaM2: 60, durationMin: 30 },
  { group: 2, intensity: 0.12, minFlowLs: 30, areaM2: 120, durationMin: 60 },
  { group: 3, intensity: 0.24, minFlowLs: 60, areaM2: 120, durationMin: 60 },
  { group: 4, intensity: 0.3, minFlowLs: 110, areaM2: 180, durationMin: 60 },
];

/**
 * Расход АУПТ по группе помещений.
 * Q[л/с] = интенсивность × площадь, но не ниже табличного минимума.
 * @returns расход, л/с
 */
export function ayptFlowLs(group: number): number {
  const spec = AYPT_GROUPS.find((g) => g.group === group) ?? AYPT_GROUPS[0];
  const byArea = spec.intensity * spec.areaM2;
  return Math.max(byArea, spec.minFlowLs);
}

// ─── 3. Расход ВПВ — СП 10.13130.2020 ────────────────────────────────────

export interface VpvSpec {
  /** Число одновременных струй. */
  streams: number;
  /** Расход одной струи, л/с. */
  streamFlowLs: number;
}

/**
 * Ориентировочный расход ВПВ по этажности жилого здания.
 * до 16 этажей — 1 струя × 2,5 л/с; 17–25 — 2 струи × 2,5 л/с.
 */
export function vpvFlowResidential(floors: number): VpvSpec {
  if (floors <= 16) return { streams: 1, streamFlowLs: 2.5 };
  return { streams: 2, streamFlowLs: 2.5 };
}

// ─── 4. Таблица «расход → DN коллектора» — нормативы-расчёта.md §2.3 ──────

export interface DnRange {
  dn: number;
  /** Диапазон расхода для напорного коллектора (v=1,0–2,5 м/с), м³/ч. */
  dischargeMin: number;
  dischargeMax: number;
  /** Диапазон расхода для всасывающего коллектора (v=0,8–1,5 м/с), м³/ч. */
  suctionMin: number;
  suctionMax: number;
}

/** Таблица расхода ↔ DN (нормативы-расчёта.md §2.3, по Шевелёву). */
export const DN_TABLE: DnRange[] = [
  { dn: 50, dischargeMin: 7, dischargeMax: 18, suctionMin: 6, suctionMax: 11 },
  { dn: 65, dischargeMin: 12, dischargeMax: 30, suctionMin: 10, suctionMax: 18 },
  { dn: 80, dischargeMin: 18, dischargeMax: 45, suctionMin: 14, suctionMax: 27 },
  { dn: 100, dischargeMin: 28, dischargeMax: 71, suctionMin: 23, suctionMax: 42 },
  { dn: 125, dischargeMin: 44, dischargeMax: 110, suctionMin: 35, suctionMax: 66 },
  { dn: 150, dischargeMin: 64, dischargeMax: 159, suctionMin: 51, suctionMax: 95 },
  { dn: 200, dischargeMin: 113, dischargeMax: 283, suctionMin: 90, suctionMax: 170 },
  { dn: 250, dischargeMin: 177, dischargeMax: 442, suctionMin: 141, suctionMax: 265 },
  { dn: 300, dischargeMin: 254, dischargeMax: 636, suctionMin: 204, suctionMax: 382 },
  { dn: 350, dischargeMin: 346, dischargeMax: 866, suctionMin: 277, suctionMax: 519 },
  { dn: 400, dischargeMin: 452, dischargeMax: 1131, suctionMin: 362, suctionMax: 679 },
];

/** Стандартный ряд DN, мм — для шага типоразмеров. */
export const DN_SERIES = DN_TABLE.map((r) => r.dn);

/**
 * Диаметр напорного коллектора по расходу станции.
 * Берётся минимальный DN, при котором расход попадает в норму скорости;
 * при расходе у верхней границы — следующий типоразмер (правило 5.1).
 * @param qM3h суммарный расход станции, м³/ч
 */
export function dischargeDnByFlow(qM3h: number): number {
  for (const r of DN_TABLE) {
    if (qM3h <= r.dischargeMax) {
      // запас: расход у верхней границы (>85 %) → следующий типоразмер
      if (qM3h > r.dischargeMax * 0.85) {
        const next = DN_TABLE.find((x) => x.dn > r.dn);
        return next ? next.dn : r.dn;
      }
      return r.dn;
    }
  }
  return DN_TABLE[DN_TABLE.length - 1].dn;
}

/**
 * Диаметр всасывающего коллектора по расходу станции.
 * Всас крупнее напорного — ниже допустимая скорость.
 */
export function suctionDnByFlow(qM3h: number): number {
  for (const r of DN_TABLE) {
    if (qM3h <= r.suctionMax) {
      if (qM3h > r.suctionMax * 0.85) {
        const next = DN_TABLE.find((x) => x.dn > r.dn);
        return next ? next.dn : r.dn;
      }
      return r.dn;
    }
  }
  return DN_TABLE[DN_TABLE.length - 1].dn;
}

/** Сдвиг DN на n типоразмеров вверх (для floor «патрубок + 2»). */
export function dnStepUp(dn: number, steps: number): number {
  const idx = DN_SERIES.indexOf(dn);
  if (idx < 0) return dn;
  const next = Math.min(idx + steps, DN_SERIES.length - 1);
  return DN_SERIES[next];
}

/** Округление DN вверх до стандартного ряда. */
export function roundUpDn(dn: number): number {
  for (const v of DN_SERIES) {
    if (v >= dn) return v;
  }
  return DN_SERIES[DN_SERIES.length - 1];
}
