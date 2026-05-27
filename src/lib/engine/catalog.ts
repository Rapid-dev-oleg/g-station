/**
 * Каталог — данные для шагов 3-4 (подбор и ценообразование).
 *
 * Движок остаётся чистым TypeScript: он НЕ знает о Prisma или БД. Шаги 3-4
 * принимают опциональный объект каталога той же формы. Если не передан —
 * подбор на уровне класса/типоразмера и оценочные цены.
 *
 * DB-реализация — `src/server/catalog.ts`.
 */

import type { Currency } from '@/lib/dossier/types';

/** Позиция-насос каталога — минимум, нужный движку. */
export interface CatalogPump {
  /** Артикул. */
  sku: string;
  /** Серия, напр. 'NIS', 'CDM'. */
  series: string;
  /** Цена в исходной валюте. */
  price: number;
  /** Валюта цены. */
  currency: Currency;
  /** Мощность двигателя, кВт (если известна). */
  powerKw?: number;
}

/** Позиция-коллектор каталога. */
export interface CatalogCollector {
  /** Шифр коллектора, напр. '200/125-2-100/65'. */
  code: string;
  /** Цена материалов, ₽. */
  priceRub: number;
  /** true — цена ориентировочная (не из прайса). */
  estimate: boolean;
}

/** Позиция-шкаф управления каталога. */
export interface CatalogPanel {
  /** Наименование (содержит мощность). */
  name: string;
  /** Цена, ₽. */
  priceRub: number;
  /** true — цена ориентировочная. */
  estimate: boolean;
}

/** Позиция-работа каталога. */
export interface CatalogWork {
  /** Наименование работы. */
  name: string;
  /** Цена, ₽. */
  priceRub: number;
  /** true — цена ориентировочная. */
  estimate: boolean;
}

/**
 * Каталог — операции, реально нужные движку (шаги 3 и 4).
 * Все методы синхронные: реализация должна предзагружать данные.
 */
export interface Catalog {
  /** Точный поиск насоса по артикулу. */
  findPumpBySku(sku: string): CatalogPump | undefined;

  /**
   * Насосы с мощностью около `kw`.
   * @param tolerance допуск в кВт (0 — точное совпадение).
   */
  findPumpsByPower(kw: number, tolerance?: number): CatalogPump[];

  /** Точный поиск коллектора по шифру. */
  findCollectorByCode(code: string): CatalogCollector | undefined;

  /** Коллекторы по основному (всасывающему) диаметру DN. */
  findCollectorsByDiameter(dn: number): CatalogCollector[];

  /** Все шкафы управления каталога (движок сам отбирает по мощности). */
  listPanels(): CatalogPanel[];

  /** Все работы каталога (движок сам ищет нужные по названию). */
  listWorks(): CatalogWork[];
}
