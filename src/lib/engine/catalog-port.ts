/**
 * CatalogPort — порт каталога для расчётного движка (инверсия зависимости).
 *
 * Движок остаётся чистым TypeScript: он НЕ знает о Prisma, БД и конкретном
 * JSON-каталоге. Шаги 3–4 принимают опциональную реализацию этого порта.
 *
 * Если порт не передан — движок выдаёт подбор на уровне класса/типоразмера
 * и оценочные цены. Это «граница автоматизации»: точная модель и цена —
 * решение инженера (нужны напорные кривые ПО производителя, склад, прайс).
 *
 * DB-реализация порта живёт вне движка (фаза 3) — `src/server/...`.
 */

import type { Currency } from '@/lib/dossier/types';

/** Позиция-насос каталога — минимум, нужный движку. */
export interface CatalogPortPump {
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
export interface CatalogPortCollector {
  /** Шифр коллектора, напр. '200/125-2-100/65'. */
  code: string;
  /** Цена материалов, ₽. */
  priceRub: number;
  /** true — цена ориентировочная (не из прайса). */
  estimate: boolean;
}

/** Позиция-шкаф управления каталога. */
export interface CatalogPortPanel {
  /** Наименование (содержит мощность). */
  name: string;
  /** Цена, ₽. */
  priceRub: number;
  /** true — цена ориентировочная. */
  estimate: boolean;
}

/** Позиция-работа каталога. */
export interface CatalogPortWork {
  /** Наименование работы. */
  name: string;
  /** Цена, ₽. */
  priceRub: number;
  /** true — цена ориентировочная. */
  estimate: boolean;
}

/**
 * Порт каталога — операции, реально нужные движку (шаги 3 и 4).
 *
 * Любая реализация (статический JSON, БД) поставляет эти операции.
 * Все методы синхронные: реализация должна предзагружать данные.
 */
export interface CatalogPort {
  /** Точный поиск насоса по артикулу. */
  findPumpBySku(sku: string): CatalogPortPump | undefined;

  /**
   * Насосы с мощностью около `kw`.
   * @param tolerance допуск в кВт (0 — точное совпадение).
   */
  findPumpsByPower(kw: number, tolerance?: number): CatalogPortPump[];

  /** Точный поиск коллектора по шифру. */
  findCollectorByCode(code: string): CatalogPortCollector | undefined;

  /** Коллекторы по основному (всасывающему) диаметру DN. */
  findCollectorsByDiameter(dn: number): CatalogPortCollector[];

  /** Все шкафы управления каталога (движок сам отбирает по мощности). */
  listPanels(): CatalogPortPanel[];

  /** Все работы каталога (движок сам ищет нужные по названию). */
  listWorks(): CatalogPortWork[];
}

/** Контекст прогона движка — расширяемый. */
export interface EngineContext {
  /**
   * Реализация каталога. Если не передана — движок работает в режиме
   * «без каталога»: класс/типоразмер оборудования и оценочные цены.
   */
  catalog?: CatalogPort;
}
