/**
 * Шаг 4 — Ценообразование (по варианту).
 *
 * Сбор BOM из equipment, цены из каталога:
 *   purchase_cost = price × rate × qty × (1 − discount/100)
 *   total_cost    = Σ purchase_cost
 *   client_price  = total_cost × коэф. наценки
 *
 * Курс, скидки, наценка — гейт 2; здесь проставляются дефолты-ориентиры.
 */

import type {
  Currency,
  Pricing,
  PricingRow,
  Station,
  Variant,
} from '@/lib/dossier/types';
import { loadCatalog } from '@/lib/catalog/load';
import {
  findCollectorByCode,
  findCollectorsByDiameter,
  findPumpBySku,
  findPumpsByPower,
} from '@/lib/catalog/query';

/** Дефолтный курс USD — ориентир, подтверждает инженер (гейт 2). */
export const DEFAULT_USD_RATE = 95;
/** Дефолтная скидка на насос CNP, %. */
export const DEFAULT_PUMP_DISCOUNT = 45;
/** Дефолтный коэффициент наценки. */
export const DEFAULT_MARKUP = 1.7;
/** Порог «крупной» станции — наценка ниже. */
const LARGE_STATION_COST = 5_000_000;
export const LARGE_STATION_MARKUP = 1.43;

/** Цена строки: price × rate × qty × (1 − discount/100). */
function purchaseCost(row: PricingRow, rate: number): number {
  const effRate = row.currency === 'RUB' ? 1 : rate;
  const gross = row.price * effRate * row.qty;
  const disc = row.discount ?? 0;
  return Math.round(gross * (1 - disc / 100) * 100) / 100;
}

/** Подбирает цену насоса из каталога по модели или мощности. */
function priceMainPump(
  model: string | undefined,
  motorKw: number | null,
): { price: number; currency: Currency; note?: string } {
  // точное совпадение по артикулу
  if (model) {
    const exact = findPumpBySku(model);
    if (exact) {
      return {
        price: exact.priceUsd ?? exact.priceRub ?? 0,
        currency: exact.currency,
      };
    }
  }
  // ближайший типоразмер по мощности
  if (motorKw != null) {
    for (const tol of [0.3, 0.6, 1.5, 4]) {
      const matches = findPumpsByPower(motorKw, tol);
      if (matches.length > 0) {
        // медианная цена среди совпадений
        const prices = matches
          .map((p) => p.priceUsd ?? p.priceRub ?? 0)
          .filter((v) => v > 0)
          .sort((a, b) => a - b);
        if (prices.length > 0) {
          const mid = prices[Math.floor(prices.length / 2)];
          return {
            price: mid,
            currency: matches[0].currency,
            note: 'грубая оценка — цена ближайшего типоразмера по мощности',
          };
        }
      }
    }
  }
  return { price: 0, currency: 'USD', note: 'грубая оценка — цена не найдена в каталоге' };
}

/** Подбирает цену коллектора по шифру / диаметру. */
function priceCollector(code: string | undefined): { price: number; note?: string } {
  if (!code) return { price: 0 };
  const exact = findCollectorByCode(code);
  if (exact) {
    return {
      price: exact.priceRub,
      note: exact.estimate ? 'грубая оценка' : undefined,
    };
  }
  // по диаметру (первое число шифра)
  const m = code.match(/^(\d+)/);
  if (m) {
    const byDn = findCollectorsByDiameter(Number(m[1]));
    if (byDn.length > 0) {
      const prices = byDn.map((c) => c.priceRub).sort((a, b) => a - b);
      return {
        price: prices[Math.floor(prices.length / 2)],
        note: 'грубая оценка — цена коллектора близкого диаметра',
      };
    }
  }
  return { price: 0, note: 'грубая оценка — цена коллектора не найдена' };
}

/** Подбирает цену ШУ по мощности из каталога панелей. */
function pricePanel(ratedKw: number | null): { price: number; note?: string } {
  const panels = loadCatalog().panels;
  if (panels.length === 0 || ratedKw == null) {
    return { price: 0, note: 'грубая оценка — прайс ШУ неполный' };
  }
  // выбрать панель с мощностью ≥ номинала (по числу в названии)
  const parsed = panels
    .map((p) => {
      const m = p.name.match(/(\d+(?:[.,]\d+)?)\s*кВт/);
      return { panel: p, kw: m ? Number(m[1].replace(',', '.')) : 0 };
    })
    .sort((a, b) => a.kw - b.kw);
  const fit = parsed.find((p) => p.kw >= ratedKw) ?? parsed[parsed.length - 1];
  return { price: fit.panel.priceRub, note: 'грубая оценка — прайс ШУ неполный' };
}

/**
 * Шаг 4 для одного варианта. Заполняет `variant.pricing`.
 * Мутирует переданный (клонированный) объект.
 */
export function processVariant4(station: Station, variant: Variant): void {
  const eq = variant.equipment;
  if (!eq) return;

  const pricing: Pricing = { ...(variant.pricing ?? {}) };
  const rate = pricing.exchange_rate ?? DEFAULT_USD_RATE;
  pricing.exchange_rate = rate;
  if (!pricing.rate_date) pricing.rate_date = new Date().toISOString().slice(0, 10);

  const rows: PricingRow[] = [];

  // ── Насосное ─────────────────────────────────────────────────────────
  if (eq.main_pump) {
    const motorKw = eq.main_pump.motor_power?.value ?? null;
    const pp = priceMainPump(eq.main_pump.model, motorKw);
    rows.push({
      position_name: `Основной насос ${eq.main_pump.model ?? eq.main_pump.construction ?? ''} ${
        motorKw ?? '?'
      } кВт`.trim(),
      position_group: 'насосное',
      price: pp.price,
      currency: pp.currency,
      qty: eq.main_pump.qty ?? 1,
      discount: DEFAULT_PUMP_DISCOUNT,
      price_note: pp.note,
    });
  }
  if (eq.jockey_pump) {
    const jp = priceMainPump(eq.jockey_pump.model, eq.jockey_pump.motor_power?.value ?? null);
    rows.push({
      position_name: `Жокей-насос ${eq.jockey_pump.model ?? ''}`.trim(),
      position_group: 'насосное',
      price: jp.price,
      currency: jp.currency,
      qty: 1,
      discount: DEFAULT_PUMP_DISCOUNT,
      price_note: jp.note ?? 'грубая оценка',
    });
  }
  if (eq.drainage_pump) {
    rows.push({
      position_name: eq.drainage_pump,
      position_group: 'насосное',
      price: 35000,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: 'грубая оценка',
    });
  }

  // ── Гидравлика — коллектор, клапаны ──────────────────────────────────
  if (eq.collector?.code) {
    const pc = priceCollector(eq.collector.code);
    rows.push({
      position_name: `Коллектор ${eq.collector.code} (${eq.collector.material ?? ''})`.trim(),
      position_group: 'гидравлика',
      price: pc.price,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: pc.note,
    });
  }
  // принадлежности — рама, датчик давления (оценочно)
  rows.push({
    position_name: 'Арматура, клапаны, реле, КИП (комплект)',
    position_group: 'гидравлика',
    price: 90000,
    currency: 'RUB',
    qty: 1,
    discount: 0,
    price_note: 'грубая оценка',
  });

  // ── Автоматика — ШУ ──────────────────────────────────────────────────
  if (eq.control_cabinet && eq.control_cabinet.brand !== 'нет') {
    const pcab = pricePanel(eq.control_cabinet.rated_power?.value ?? null);
    rows.push({
      position_name: `ШУ ${eq.control_cabinet.brand ?? ''} ${eq.control_cabinet.series ?? ''}`.trim(),
      position_group: 'автоматика',
      price: pcab.price,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: pcab.note,
    });
  }

  // ── Корпус ───────────────────────────────────────────────────────────
  if (eq.housing?.type) {
    rows.push({
      position_name: `Корпус: ${eq.housing.type}`,
      position_group: 'корпус',
      price: 1_100_000,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: 'грубая оценка',
    });
  }

  // ── Резервуары ───────────────────────────────────────────────────────
  if (eq.reservoirs?.count) {
    const vol = eq.reservoirs.volume?.value ?? 0;
    rows.push({
      position_name: `Резервуар пожарного запаса${vol ? ` ${vol} м³` : ''}`,
      position_group: 'резервуары',
      price: 400_000,
      currency: 'RUB',
      qty: eq.reservoirs.count,
      discount: 0,
      price_note: 'грубая оценка — резервуары часто считаются отдельным блоком',
    });
  }

  // ── Работа — сварка коллектора и рамы, расключение ───────────────────
  const works = loadCatalog().works;
  const weld = works.find((w) => /рам/i.test(w.name));
  const wiring = works.find((w) => /расключ/i.test(w.name));
  if (weld) {
    rows.push({
      position_name: weld.name,
      position_group: 'работа',
      price: weld.priceRub,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: weld.estimate ? 'грубая оценка' : undefined,
    });
  }
  if (wiring) {
    rows.push({
      position_name: wiring.name,
      position_group: 'работа',
      price: wiring.priceRub,
      currency: 'RUB',
      qty: 1,
      discount: 0,
      price_note: wiring.estimate ? 'грубая оценка' : undefined,
    });
  }

  // ── Итоги ────────────────────────────────────────────────────────────
  for (const row of rows) {
    row.purchase_cost = purchaseCost(row, rate);
  }
  const totalCost = Math.round(rows.reduce((s, r) => s + (r.purchase_cost ?? 0), 0) * 100) / 100;

  const markup =
    pricing.markup_coefficient ??
    (totalCost > LARGE_STATION_COST ? LARGE_STATION_MARKUP : DEFAULT_MARKUP);

  pricing.rows = rows;
  pricing.total_cost = totalCost;
  pricing.markup_coefficient = markup;
  pricing.client_price = Math.round(totalCost * markup * 100) / 100;

  variant.pricing = pricing;
}
