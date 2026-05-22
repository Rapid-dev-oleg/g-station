/**
 * Задел под адаптеры импорта прайсов (Фаза 3).
 *
 * Каждый поставщик/тип прайса (работы, продукция «Гидростроя», и т.п.)
 * реализует `PriceAdapter`. Реализации добавляются по мере появления
 * прайсов; пока определены только интерфейс и регистр.
 *
 * Парсер CNP (`./cnp-csv.ts`) реализован отдельной функцией, при желании
 * его можно обернуть в адаптер и зарегистрировать здесь.
 */
import type { PriceMeta } from '../types';

/** Результат разбора прайса адаптером. */
export type PriceParseResult = {
  /** Сырые строки — валидируются вызывающей стороной через zod-схемы. */
  rows: unknown[];
  meta: PriceMeta;
};

/** Адаптер импорта одного формата прайса. */
export interface PriceAdapter {
  /** Уникальный идентификатор адаптера, напр. 'cnp', 'gidrostroy-works'. */
  id: string;
  /** Человекочитаемое название. */
  name?: string;
  /** Разбирает содержимое файла прайса. */
  parse(content: string): PriceParseResult;
}

/** Регистр зарегистрированных адаптеров. */
const registry = new Map<string, PriceAdapter>();

/** Регистрирует адаптер прайса. */
export function registerPriceAdapter(adapter: PriceAdapter): void {
  registry.set(adapter.id, adapter);
}

/** Возвращает адаптер по id либо undefined. */
export function getPriceAdapter(id: string): PriceAdapter | undefined {
  return registry.get(id);
}

/** Список id всех зарегистрированных адаптеров. */
export function listPriceAdapters(): string[] {
  return [...registry.keys()];
}
