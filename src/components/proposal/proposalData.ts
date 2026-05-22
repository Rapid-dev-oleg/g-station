/**
 * Сборка данных ТКП из расчётных дел систем проекта.
 *
 * Источник — `System.dossier` (Dossier). Для каждой системы берётся
 * выбранный вариант (output.selected_variant), его спецификация
 * оборудования (variant.equipment) сворачивается в строки сметы из
 * variant.pricing.rows. Если pricing пуст — система показывается без
 * позиций (расчёт не доведён до шага 4).
 */

import type { Dossier, PricingRow, Station, Variant } from '@/lib/dossier/types';

/** Одна позиция спецификации/сметы для печати. */
export interface ProposalRow {
  position: number;
  name: string;
  group?: string;
  unitPrice: number;
  currency: string;
  qty: number;
  discount: number;
  /** Закупочная стоимость позиции (purchase_cost из дела или расчётная). */
  cost: number;
  note?: string;
}

/** Блок одной системы проекта в ТКП. */
export interface ProposalSystem {
  id: string;
  name: string;
  typeName: string;
  /** Шифр изделия из output.product_code, если есть. */
  productCode?: string;
  Q: number | null;
  H: number | null;
  power: number | null;
  pumpBrand?: string;
  pumpModel?: string;
  pumpQty?: number;
  scheme?: string;
  variantName?: string;
  rows: ProposalRow[];
  /** Итог по системе — total_cost дела или сумма строк. */
  total: number;
  /** Расчёт не доведён до ценообразования. */
  pricingMissing: boolean;
}

/** Итоговая модель ТКП. */
export interface ProposalData {
  systems: ProposalSystem[];
  /** Σ закупки по всем системам. */
  grandCost: number;
  /** Хотя бы у одной системы нет цен. */
  anyPricingMissing: boolean;
}

/** Выбранный вариант станции (по output.selected_variant, иначе первый). */
function selectedVariant(station: Station): Variant | undefined {
  const idx = station.output?.selected_variant ?? 0;
  return station.variants?.[idx] ?? station.variants?.[0];
}

/** Закупочная стоимость строки: purchase_cost из дела или price·qty со скидкой. */
function rowCost(row: PricingRow, rate: number): number {
  if (row.purchase_cost != null) return row.purchase_cost;
  const base = row.price * row.qty * (1 - (row.discount ?? 0) / 100);
  const cur = row.currency ?? 'RUB';
  return cur === 'RUB' ? base : base * rate;
}

/** Собирает данные ТКП из системы (одна станция = stations[0]). */
function buildSystem(
  id: string,
  name: string,
  typeName: string,
  dossier: Dossier | null | undefined,
): ProposalSystem {
  const station = dossier?.stations?.[0];
  const variant = station ? selectedVariant(station) : undefined;
  const pricing = variant?.pricing;
  const rate = pricing?.exchange_rate ?? 1;
  const pump = variant?.equipment?.main_pump;

  const rows: ProposalRow[] = (pricing?.rows ?? []).map((r, i) => ({
    position: i + 1,
    name: r.position_name,
    group: r.position_group,
    unitPrice: r.price,
    currency: r.currency ?? 'RUB',
    qty: r.qty,
    discount: r.discount ?? 0,
    cost: rowCost(r, rate),
    note: r.price_note,
  }));

  const total =
    pricing?.total_cost ?? rows.reduce((s, r) => s + r.cost, 0);

  return {
    id,
    name,
    typeName,
    productCode: station?.output?.product_code,
    Q: station?.calc?.Q_target?.value ?? station?.input?.Q?.value ?? null,
    H: station?.calc?.H_target?.value ?? station?.input?.H?.value ?? null,
    power: pump?.motor_power?.value ?? null,
    pumpBrand: pump?.brand,
    pumpModel: pump?.model,
    pumpQty: pump?.qty,
    scheme: variant?.reservation_scheme ?? station?.input?.reservation_scheme,
    variantName: variant?.name,
    rows,
    total,
    pricingMissing: rows.length === 0,
  };
}

/** Входная система проекта (минимум полей для ТКП). */
export interface ProposalSystemInput {
  id: string;
  name: string;
  typeName: string;
  dossier: Dossier | null | undefined;
}

/** Собирает полную модель ТКП по системам проекта. */
export function buildProposalData(
  systems: ProposalSystemInput[],
): ProposalData {
  const built = systems.map((s) =>
    buildSystem(s.id, s.name, s.typeName, s.dossier),
  );
  return {
    systems: built,
    grandCost: built.reduce((sum, s) => sum + s.total, 0),
    anyPricingMissing: built.some((s) => s.pricingMissing),
  };
}

/** Уникальные нормативы по всем расчётным делам проекта (calc.applicable_norms). */
export function collectNorms(
  systems: ProposalSystemInput[],
): string[] {
  const set = new Set<string>();
  for (const s of systems) {
    for (const st of s.dossier?.stations ?? []) {
      for (const n of st.calc?.applicable_norms ?? []) set.add(n);
    }
  }
  return [...set].sort();
}
