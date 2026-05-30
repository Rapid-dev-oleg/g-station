/**
 * Подбор класса насоса — правило 3.9-A v2 (матрица 12 зон Q × H × площадка).
 *
 * Заменяет захардкоженную `pumpClass(hM, qM3h, required)` из step3-select:
 * - использует Q_per_pump (не Q всей станции);
 * - модификатор по площадке (tight/spacious) — для серых зон;
 * - переопределения ТЗ: «вертикальные», «многоступенчатые», «ин-лайн».
 *
 * Источник матрицы — `gidrostroy/KNOWLEDGE/правила-расчёта.md` §3.9-A v2.
 */

import type {
  Footprint,
  PumpClassCode,
  PumpClassRule,
  PumpClassZone,
  Rules,
} from '../rules';
import type { StationEnclosure } from '@/lib/dossier/types';

type InstallationPlace = 'в-помещении' | 'под-заливом' | 'заглублённая' | 'на-берегу';

export interface PumpClassInput {
  /** Расход на один насос, м³/ч (Q_станции / working_pumps). */
  qPerPump: number;
  /** Целевой напор, м. */
  hTarget: number;
  /** Корпус станции (определяет footprint). */
  stationEnclosure?: StationEnclosure;
  /** Место установки. */
  installationPlace?: InstallationPlace;
  /** Прямые требования ТЗ к типу насоса (массив свободных слов). */
  required?: string[];
}

export interface PumpClassResult {
  classCode: PumpClassCode;
  construction: string;
  seriesHint: string;
  rpm?: number;
  /** Id зоны / триггера, который сработал. */
  triggerId: string;
}

/** Мапит площадку из ТЗ в категорию footprint матрицы 3.9-A. */
export function footprintOf(
  enclosure?: StationEnclosure,
  place?: InstallationPlace,
): Footprint {
  if (place === 'заглублённая') return 'tight';
  switch (enclosure) {
    case 'подземное-стеклопластик':
    case 'стеклопластиковый-колодец':
    case 'блок-бокс':
    case 'в-чужом-резервуаре':
      return 'tight';
    case 'технологический-павильон':
      return 'spacious';
    default:
      return 'any';
  }
}

/**
 * Считает срабатывает ли ТЗ-флаг «требуется вертикальная компоновка».
 * Триггеры: упоминание «вертикал», «многоступ», «in-line», «ин-лайн».
 */
export function requiresVertical(required?: string[]): boolean {
  const r = (required ?? []).join(' ').toLowerCase();
  return (
    r.includes('вертикал') ||
    r.includes('многоступ') ||
    r.includes('in-line') ||
    r.includes('ин-лайн')
  );
}

/**
 * Применяет правило 3.9-A v2 — первая сработавшая зона выигрывает.
 * Без правила-конфига — берётся встроенный fallback.
 */
export function evalPumpClass(args: PumpClassInput, rules?: Rules): PumpClassResult {
  const rule = rules?.pumpClass ?? DEFAULT_PUMP_CLASS_RULE;
  const footprint = footprintOf(args.stationEnclosure, args.installationPlace);
  const vertical = requiresVertical(args.required);

  for (const z of rule.zones) {
    if (matchZone(z, args.qPerPump, args.hTarget, footprint, vertical)) {
      return {
        classCode: z.classCode,
        construction: z.construction,
        seriesHint: z.seriesHint,
        rpm: z.rpm,
        triggerId: z.id,
      };
    }
  }

  return {
    classCode: rule.defaultZone.classCode,
    construction: rule.defaultZone.construction,
    seriesHint: rule.defaultZone.seriesHint,
    triggerId: 'default',
  };
}

function matchZone(
  z: PumpClassZone,
  qpp: number,
  h: number,
  footprint: Footprint,
  vertical: boolean,
): boolean {
  if (z.qppMin != null && qpp < z.qppMin) return false;
  if (z.qppMax != null && qpp >= z.qppMax) return false;
  if (z.hMin != null && h < z.hMin) return false;
  if (z.hMax != null && h >= z.hMax) return false;
  if (z.footprintIn != null && !z.footprintIn.includes(footprint)) return false;
  if (z.requiresVertical != null && z.requiresVertical !== vertical) return false;
  return true;
}

/**
 * Встроенный fallback правила 3.9-A v2 — идентичен сидингу в БД.
 * Зоны идут в порядке убывания приоритета (overrides ТЗ → крупный расход
 * → высокий напор → средние диапазоны → серые зоны с разводкой по footprint).
 */
export const DEFAULT_PUMP_CLASS_RULE: PumpClassRule = {
  ruleId: '3.9-A-pump-class',
  version: 'fallback',
  defaultZone: {
    classCode: 'END_SUCTION',
    construction: 'консольный моноблочный (универсальный)',
    seriesHint: 'CNP NIS',
  },
  zones: [
    // 0. SPLIT_CASE поверх всего: Q_pp > 400.
    {
      id: 'split-case-large-q',
      qppMin: 400,
      classCode: 'SPLIT_CASE',
      construction: 'двусторонний всас (сплит-кейс)',
      seriesHint: 'CNP SMM / Д320',
      rpm: 1450,
    },
    // 1. H > 100, Q_pp > 200 → END_SUCTION крупный.
    {
      id: 'h-gt-100-q-gt-200',
      hMin: 100,
      qppMin: 200,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый (высокий напор, крупный расход)',
      seriesHint: 'CNP NIS / NES / NM',
      rpm: 2900,
    },
    // 2. H > 100, Q_pp ≤ 200 → MULTISTAGE.
    {
      id: 'h-gt-100-q-le-200',
      hMin: 100,
      qppMax: 200,
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый (высокий напор)',
      seriesHint: 'CNP CDM / CDMF / CV',
      rpm: 2900,
    },
    // 3a. H 80-100, Q_pp ≥ 90, вертикаль НЕ требуется → END_SUCTION.
    {
      id: 'h-80-100-q-ge-90-no-vert',
      hMin: 80,
      hMax: 100,
      qppMin: 90,
      requiresVertical: false,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый (крупный типоразмер 220–260 мм)',
      seriesHint: 'CNP NIS / NES / NM',
      rpm: 2900,
    },
    // 3b. H 80-100, Q_pp ≥ 90, требуется вертикаль → MULTISTAGE.
    {
      id: 'h-80-100-q-ge-90-vert',
      hMin: 80,
      hMax: 100,
      qppMin: 90,
      requiresVertical: true,
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый (ТЗ-требование)',
      seriesHint: 'CNP CDM / CV',
      rpm: 2900,
    },
    // 3c. H 80-100, Q_pp < 90 → MULTISTAGE.
    {
      id: 'h-80-100-q-lt-90',
      hMin: 80,
      hMax: 100,
      qppMax: 90,
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый',
      seriesHint: 'CNP CDM / CV',
      rpm: 2900,
    },
    // 4a. H 50-80, Q_pp ≥ 90 → END_SUCTION.
    {
      id: 'h-50-80-q-ge-90',
      hMin: 50,
      hMax: 80,
      qppMin: 90,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый',
      seriesHint: 'CNP NIS / NES / NM',
      rpm: 2900,
    },
    // 4b. H 50-80, Q_pp < 90 → MULTISTAGE.
    {
      id: 'h-50-80-q-lt-90',
      hMin: 50,
      hMax: 80,
      qppMax: 90,
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый',
      seriesHint: 'CNP CDM / CV',
      rpm: 2900,
    },
    // 5a. H 30-50, Q_pp ≥ 100 → END_SUCTION.
    {
      id: 'h-30-50-q-ge-100',
      hMin: 30,
      hMax: 50,
      qppMin: 100,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый',
      seriesHint: 'CNP NIS / NES / NBW',
      rpm: 2900,
    },
    // 5b. H 30-50, Q_pp 50-100, вертикаль требуется → MULTISTAGE (триггер референса Wilo MVL).
    {
      id: 'h-30-50-q-50-100-vert',
      hMin: 30,
      hMax: 50,
      qppMin: 50,
      qppMax: 100,
      requiresVertical: true,
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый (ТЗ-референс типа Wilo MVL)',
      seriesHint: 'CNP CDM / CV',
      rpm: 2900,
    },
    // 5c. H 30-50, Q_pp 50-100, footprint tight → IN_LINE (компромисс).
    {
      id: 'h-30-50-q-50-100-tight',
      hMin: 30,
      hMax: 50,
      qppMin: 50,
      qppMax: 100,
      footprintIn: ['tight'],
      classCode: 'IN_LINE',
      construction: 'ин-лайн (компромисс, тесная площадка)',
      seriesHint: 'CNP TD',
      rpm: 2900,
    },
    // 5d. H 30-50, Q_pp 50-100, прочее → END_SUCTION.
    {
      id: 'h-30-50-q-50-100-spacious',
      hMin: 30,
      hMax: 50,
      qppMin: 50,
      qppMax: 100,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый (просторная площадка)',
      seriesHint: 'CNP NIS / NES',
      rpm: 2900,
    },
    // 5e. H 30-50, Q_pp < 50, footprint tight → MULTISTAGE.
    {
      id: 'h-30-50-q-lt-50-tight',
      hMin: 30,
      hMax: 50,
      qppMax: 50,
      footprintIn: ['tight'],
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый (тесная площадка)',
      seriesHint: 'CNP CDM',
      rpm: 2900,
    },
    // 5f. H 30-50, Q_pp < 50, footprint spacious → IN_LINE.
    {
      id: 'h-30-50-q-lt-50-spacious',
      hMin: 30,
      hMax: 50,
      qppMax: 50,
      footprintIn: ['spacious'],
      classCode: 'IN_LINE',
      construction: 'ин-лайн (просторная площадка)',
      seriesHint: 'CNP TD',
      rpm: 2900,
    },
    // 5g. H 30-50, Q_pp < 50, площадка не задана → MULTISTAGE (типовой выбор
    //     инженера-Анохина: малая пожарная ВПВ часто = CDM). Инженеры Загорянский/
    //     Никитин предпочитают IN_LINE TD, но это уже автор-зависимо: правилом по
    //     Q/H не отделить без признака автора. Оставлено MULTISTAGE — поддерживает
    //     7 кейсов Анохина против 4 кейсов Загорянского/Никитина.
    {
      id: 'h-30-50-q-lt-50-any',
      hMin: 30,
      hMax: 50,
      qppMax: 50,
      footprintIn: ['any'],
      classCode: 'MULTISTAGE',
      construction: 'вертикальный многоступенчатый (типовой для пожарной серой зоны)',
      seriesHint: 'CNP CDM',
      rpm: 2900,
    },
    // 6a. H 20-30, Q_pp ≥ 50 → END_SUCTION.
    {
      id: 'h-20-30-q-ge-50',
      hMin: 20,
      hMax: 30,
      qppMin: 50,
      classCode: 'END_SUCTION',
      construction: 'консольный одноступенчатый',
      seriesHint: 'CNP NIS / NES / NBW / BL',
      rpm: 2900,
    },
    // 6b. H 20-30, Q_pp < 50 → IN_LINE.
    {
      id: 'h-20-30-q-lt-50',
      hMin: 20,
      hMax: 30,
      qppMax: 50,
      classCode: 'IN_LINE',
      construction: 'вертикальный ин-лайн одноступенчатый',
      seriesHint: 'CNP TD / IL / IPN',
      rpm: 2900,
    },
    // 7a. H < 20, Q_pp ≥ 50 → END_SUCTION низконапорный.
    {
      id: 'h-lt-20-q-ge-50',
      hMax: 20,
      qppMin: 50,
      classCode: 'END_SUCTION',
      construction: 'консольный низконапорный (большой расход)',
      seriesHint: 'CNP NIS / NES / NBW',
      rpm: 2900,
    },
    // 7b. H < 20, Q_pp < 50, footprint tight → компактный END_SUCTION (Izosimova-04 промах v2).
    {
      id: 'h-lt-20-q-lt-50-tight',
      hMax: 20,
      qppMax: 50,
      footprintIn: ['tight'],
      classCode: 'END_SUCTION',
      construction: 'консольный компактный (подземка)',
      seriesHint: 'CNP NES65-50 / NBW',
      rpm: 2900,
    },
    // 7c. H < 20, Q_pp < 50, footprint spacious → IN_LINE.
    {
      id: 'h-lt-20-q-lt-50-spacious',
      hMax: 20,
      qppMax: 50,
      footprintIn: ['spacious'],
      classCode: 'IN_LINE',
      construction: 'ин-лайн (просторная площадка)',
      seriesHint: 'CNP TD / IL / IPN',
      rpm: 2900,
    },
    // 7d. H < 20, Q_pp < 50, площадка не задана → дефолт END_SUCTION компактный.
    {
      id: 'h-lt-20-q-lt-50-any',
      hMax: 20,
      qppMax: 50,
      footprintIn: ['any'],
      classCode: 'END_SUCTION',
      construction: 'консольный компактный (универсальный для малой подземной)',
      seriesHint: 'CNP NES65-50',
      rpm: 2900,
    },
  ],
};
