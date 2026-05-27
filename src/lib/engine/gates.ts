/**
 * Три гейта инженера (human-in-the-loop) — что вынести на проверку.
 *
 * Гейт 1 — после шага 1: допущения, пустые обязательные поля, тип/сценарий.
 * Гейт 2 — на шаге 4: курс, скидки, бренд насоса, коэффициент наценки.
 * Гейт 3 — после шага 5: validation_flags, зоны «уточнить».
 *
 * Гейты не закрывают развилки сами — формируют отчёт для инженера.
 */

import type { Dossier, Measured, Station } from '@/lib/dossier/types';
import { fireModule } from './types/fire';

/** Один пункт, требующий решения инженера. */
export interface GateItem {
  /** Поле/тема. */
  field: string;
  /** Что именно требует решения. */
  issue: string;
  /** Текущее значение (если есть). */
  current?: string;
}

/** Отчёт по гейту. */
export interface GateReport {
  gate: 1 | 2 | 3;
  stationIndex: number;
  /** true — гейт можно пройти без правок. */
  clear: boolean;
  items: GateItem[];
}

/** Достаёт значение по точечному пути из объекта. */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Пусто ли значение Measured / примитив. */
function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'object' && 'value' in (v as object)) {
    return (v as Measured).value == null;
  }
  return false;
}

// ─── Гейт 1 — после шага 1 ───────────────────────────────────────────────

/**
 * Гейт 1: допущения (source='assumed'), пустые обязательные поля,
 * определённые тип станции и сценарий.
 */
export function gate1(dossier: Dossier, stationIndex: number): GateReport {
  const station = dossier.stations[stationIndex];
  const { input } = station;
  const items: GateItem[] = [];

  // Поля с source='assumed' — рекурсивный обход input.
  collectAssumed(input, '', items);

  // Пустые обязательные поля типа.
  for (const path of fireModule.requiredFields(input)) {
    const v = getByPath(input, path);
    if (isEmpty(v)) {
      items.push({ field: path, issue: 'обязательное поле не заполнено' });
    }
  }

  // Тип станции и сценарий — на подтверждение.
  items.push({
    field: 'station_type',
    issue: `тип станции определён как «${fireModule.label}» — подтвердить`,
    current: input.station_type,
  });
  items.push({
    field: 'scenario',
    issue: 'сценарий обработки — подтвердить',
    current: dossier.meta.scenario,
  });

  // Допущения из input.assumptions.
  for (const a of input.assumptions ?? []) {
    items.push({ field: 'assumptions', issue: a });
  }

  return { gate: 1, stationIndex, clear: items.length <= 2, items };
}

/** Рекурсивно собирает Measured-поля с source='assumed'. */
function collectAssumed(obj: unknown, prefix: string, out: GateItem[]): void {
  if (obj == null || typeof obj !== 'object') return;
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val != null && typeof val === 'object') {
      const m = val as Measured;
      if ('source' in m && m.source === 'assumed') {
        out.push({
          field: path,
          issue: 'допущение — требует проверки',
          current: m.value != null ? `${m.value}${m.unit ?? ''}${m.note ? ` (${m.note})` : ''}` : undefined,
        });
      } else if (!('value' in m)) {
        collectAssumed(val, path, out);
      }
    }
  }
}

// ─── Гейт 2 — на шаге 4 ──────────────────────────────────────────────────

/**
 * Гейт 2: курс валюты, скидки, бренд насоса, коэффициент наценки.
 */
export function gate2(dossier: Dossier, stationIndex: number): GateReport {
  const station = dossier.stations[stationIndex];
  const items: GateItem[] = [];

  for (const [vi, variant] of (station.variants ?? []).entries()) {
    const tag = `вариант ${vi} «${variant.name}»`;
    const pricing = variant.pricing;

    if (!pricing || pricing.exchange_rate == null) {
      items.push({ field: `${tag}.exchange_rate`, issue: 'курс валюты не задан — выставить вручную' });
    } else {
      items.push({
        field: `${tag}.exchange_rate`,
        issue: 'курс валюты — подтвердить (по практике занижается)',
        current: String(pricing.exchange_rate),
      });
    }

    // Скидки по строкам.
    for (const row of pricing?.rows ?? []) {
      if (row.position_group === 'насосное' && (row.discount ?? 0) === 0) {
        items.push({
          field: `${tag} / ${row.position_name}`,
          issue: 'скидка на насос не задана (CNP 45–50 %, Wilo 40 %)',
        });
      }
    }

    // Бренд насоса.
    const brand = variant.equipment?.main_pump?.brand;
    items.push({
      field: `${tag}.main_pump.brand`,
      issue: 'бренд/производитель насоса — решение инженера (склад, цена)',
      current: brand,
    });

    // Коэффициент наценки.
    if (pricing?.markup_coefficient == null) {
      items.push({
        field: `${tag}.markup_coefficient`,
        issue: 'коэффициент наценки не задан (≈1,7 обычные / ≈1,43 крупные)',
      });
    } else {
      items.push({
        field: `${tag}.markup_coefficient`,
        issue: 'коэффициент наценки — подтвердить',
        current: String(pricing.markup_coefficient),
      });
    }

    // Позиции с грубой оценкой.
    for (const row of pricing?.rows ?? []) {
      if (row.price_note) {
        items.push({ field: `${tag} / ${row.position_name}`, issue: row.price_note });
      }
    }
  }

  return { gate: 2, stationIndex, clear: false, items };
}

// ─── Гейт 3 — после шага 5 ───────────────────────────────────────────────

/**
 * Гейт 3: validation_flags + зоны «уточнить» (модель насоса, DN, бренд).
 */
export function gate3(dossier: Dossier, stationIndex: number): GateReport {
  const station: Station = dossier.stations[stationIndex];
  const items: GateItem[] = [];

  for (const flag of station.output?.validation_flags ?? []) {
    items.push({ field: 'validation_flags', issue: `флаг валидации: ${flag}` });
  }

  // Зоны «решение инженера» / «уточнить».
  for (const [vi, variant] of (station.variants ?? []).entries()) {
    const tag = `вариант ${vi}`;
    const pump = variant.equipment?.main_pump;
    if (pump && !pump.model) {
      items.push({
        field: `${tag}.main_pump.model`,
        issue: 'точная модель насоса — решение инженера (напорные кривые ПО производителя)',
      });
    }
    if (variant.equipment?.collector?.code) {
      items.push({
        field: `${tag}.collector`,
        issue: 'DN коллектора — возможен разброс ±1 типоразмер, уточнить по выбранному насосу',
        current: variant.equipment.collector.code,
      });
    }
  }

  return { gate: 3, stationIndex, clear: items.length === 0, items };
}

/** Все гейты по делу (для UI/отчёта). */
export function allGates(dossier: Dossier): GateReport[] {
  const reports: GateReport[] = [];
  for (let i = 0; i < dossier.stations.length; i++) {
    reports.push(gate1(dossier, i), gate2(dossier, i), gate3(dossier, i));
  }
  return reports;
}
