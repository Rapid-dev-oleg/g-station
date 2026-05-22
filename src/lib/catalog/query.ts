/**
 * Функции запроса по JSON-каталогу ценообразования (Фаза 3).
 */
import { loadCatalog } from './load';
import type { CatalogCollector, CatalogPump } from './types';

/** Точный поиск насоса по артикулу. */
export function findPumpBySku(sku: string): CatalogPump | undefined {
  const needle = sku.trim().toLowerCase();
  return loadCatalog().pumps.find((p) => p.sku.toLowerCase() === needle);
}

/** Все насосы серии (точное совпадение поля series, регистронезависимо). */
export function findPumpsBySeries(series: string): CatalogPump[] {
  const needle = series.trim().toLowerCase();
  return loadCatalog().pumps.filter((p) => p.series.toLowerCase() === needle);
}

/**
 * Насосы с мощностью около `kw`.
 * @param tolerance допуск в кВт (по умолчанию 0 — точное совпадение).
 */
export function findPumpsByPower(kw: number, tolerance = 0): CatalogPump[] {
  return loadCatalog().pumps.filter(
    (p) => p.powerKw !== undefined && Math.abs(p.powerKw - kw) <= tolerance,
  );
}

/** Точный поиск коллектора по шифру. */
export function findCollectorByCode(code: string): CatalogCollector | undefined {
  const needle = code.trim().toLowerCase();
  return loadCatalog().collectors.find((c) => c.code.toLowerCase() === needle);
}

/**
 * Коллекторы по основному (всасывающему) диаметру.
 * Берётся первое число шифра, напр. шифр '200/125-2-100/65' → DN200.
 */
export function findCollectorsByDiameter(dn: number): CatalogCollector[] {
  return loadCatalog().collectors.filter((c) => {
    const m = c.code.match(/^(\d+)/);
    return m !== null && Number(m[1]) === dn;
  });
}
