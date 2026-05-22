/**
 * Типы позиций каталога ценообразования (Фаза 3).
 *
 * Эти типы описывают JSON-каталог (`src/data/catalog/*.json`), который
 * наполняется импортом внешних прайсов. Его задача — ценообразование
 * (артикул → цена). Подбор насоса по точке Q/H выполняет отдельный движок
 * (`src/lib/calc`), каталог лишь даёт цену.
 *
 * Это отдельная подсистема от статического каталога подбора
 * (`src/lib/catalog/pumps.ts` и т.п., тип `PumpSku`).
 */

export type Currency = 'USD' | 'CNY' | 'RUB';

/** Позиция-насос из прайса поставщика. */
export type CatalogPump = {
  /** Артикул (уникальный ключ). */
  sku: string;
  /** Бренд, напр. 'CNP'. */
  brand: string;
  /** Серия, напр. 'NIS', 'CDM'. */
  series: string;
  /** Модель/наименование (как правило совпадает с артикулом). */
  model: string;
  /** Цена в долларах США (если прайс в USD). */
  priceUsd?: number;
  /** Цена в рублях (если прайс в RUB или после конвертации). */
  priceRub?: number;
  /** Валюта исходного прайса. */
  currency: Currency;
  /** Мощность двигателя, кВт — извлекается из артикула где паттерн ясен. */
  powerKw?: number;
  /** Дата прайса (ISO YYYY-MM-DD). */
  priceDate?: string;
  /** Источник: метка прайса, напр. 'CNP прайс 2026-05-21'. */
  source: string;
};

/** Позиция-коллектор. */
export type CatalogCollector = {
  /** Артикул (уникальный ключ). */
  sku: string;
  /** Шифр коллектора, напр. '200/125-2-100/65'. */
  code: string;
  /** Материал: 'углерод.', 'нержавейка' и т.п. */
  material: string;
  /** Цена материалов коллектора, ₽. */
  priceRub: number;
  /** true — цена ориентировочная (реконструкция/оценка), не из прайса. */
  estimate: boolean;
  /** Источник данных. */
  source: string;
};

/** Позиция-шкаф управления (ЩУН/ШУФ). */
export type CatalogPanel = {
  sku: string;
  name: string;
  priceRub: number;
  estimate: boolean;
  source: string;
};

/** Позиция-принадлежность (датчики, компенсаторы, КОФ и т.п.). */
export type CatalogAccessory = {
  sku: string;
  name: string;
  priceRub: number;
  estimate: boolean;
  source: string;
};

/** Позиция-работа (сварка, монтаж, расключение). */
export type CatalogWork = {
  sku: string;
  name: string;
  priceRub: number;
  estimate: boolean;
  source: string;
};

/** Метаданные импортированного прайса. */
export type PriceMeta = {
  /** Источник, напр. 'CNP прайс 2026-05-21'. */
  source: string;
  /** Имя/путь исходного файла. */
  file: string;
  /** Дата импорта или дата прайса (ISO YYYY-MM-DD). */
  date: string;
  /** Сколько позиций принято. */
  rowCount: number;
  /** Валюта прайса. */
  currency: string;
};

/** Полный набор данных каталога. */
export type Catalog = {
  pumps: CatalogPump[];
  collectors: CatalogCollector[];
  panels: CatalogPanel[];
  accessories: CatalogAccessory[];
  works: CatalogWork[];
  meta: PriceMeta[];
};
