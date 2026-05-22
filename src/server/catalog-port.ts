/**
 * DB-реализация `CatalogPort` поверх Prisma-модели `CatalogItem` (Фаза 3).
 *
 * Порт движка синхронный (`src/lib/engine/catalog-port.ts`): движок не умеет
 * `await`. Поэтому реализация предзагружает позиции каталога из БД в память
 * (фабрика `createDbCatalogPort` асинхронная), а сам объект порта отвечает
 * на запросы синхронно по загруженному снимку.
 *
 * Категории каталога: 'pumps' (насосы), 'collectors' (коллекторы),
 * 'panels' (шкафы управления), 'works' (работы). Атрибуты позиции лежат
 * в JSONB-поле `attributes` (series, powerKw, code, …).
 */
import type {
  CatalogPort,
  CatalogPortCollector,
  CatalogPortPanel,
  CatalogPortPump,
  CatalogPortWork,
} from '@/lib/engine/catalog-port';
import type { Currency } from '@/lib/dossier/types';
import { db } from '@/server/db';

/** Сырой снимок позиции из БД. */
type ItemRow = {
  sku: string;
  name: string;
  categoryCode: string;
  attributes: unknown;
  price: number | null;
  currency: string | null;
};

/** Безопасно читает строковое поле из JSONB-атрибутов. */
function attrStr(attrs: unknown, key: string): string | undefined {
  if (attrs && typeof attrs === 'object' && key in (attrs as Record<string, unknown>)) {
    const v = (attrs as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** Безопасно читает числовое поле из JSONB-атрибутов. */
function attrNum(attrs: unknown, key: string): number | undefined {
  if (attrs && typeof attrs === 'object' && key in (attrs as Record<string, unknown>)) {
    const v = (attrs as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

/** Нормализует валюту строки к типу движка (дефолт — RUB). */
function toCurrency(c: string | null): Currency {
  return c === 'USD' || c === 'CNY' || c === 'RUB' ? c : 'RUB';
}

/**
 * Строит синхронный `CatalogPort` поверх загруженного снимка позиций.
 * @internal экспортируется для тестов; в приложении — `createDbCatalogPort`.
 */
export function buildCatalogPort(items: ItemRow[]): CatalogPort {
  const pumps: CatalogPortPump[] = [];
  const collectors: CatalogPortCollector[] = [];
  const panels: CatalogPortPanel[] = [];
  const works: CatalogPortWork[] = [];

  for (const it of items) {
    if (it.price == null || it.price <= 0) continue;
    switch (it.categoryCode) {
      case 'pumps':
        pumps.push({
          sku: it.sku,
          series: attrStr(it.attributes, 'series') ?? '',
          price: it.price,
          currency: toCurrency(it.currency),
          powerKw: attrNum(it.attributes, 'powerKw'),
        });
        break;
      case 'collectors':
        collectors.push({
          code: attrStr(it.attributes, 'code') ?? it.sku,
          priceRub: it.price,
          estimate: false,
        });
        break;
      case 'panels':
        panels.push({ name: it.name, priceRub: it.price, estimate: false });
        break;
      case 'works':
        works.push({ name: it.name, priceRub: it.price, estimate: false });
        break;
      default:
        break;
    }
  }

  const pumpBySku = new Map(pumps.map((p) => [p.sku, p]));
  const collectorByCode = new Map(collectors.map((c) => [c.code, c]));

  return {
    findPumpBySku: (sku) => pumpBySku.get(sku),

    findPumpsByPower: (kw, tolerance = 0) =>
      pumps.filter(
        (p) => p.powerKw !== undefined && Math.abs(p.powerKw - kw) <= tolerance,
      ),

    findCollectorByCode: (code) => collectorByCode.get(code),

    findCollectorsByDiameter: (dn) =>
      collectors.filter((c) => {
        const m = c.code.match(/^(\d+)/);
        return m ? Number(m[1]) === dn : false;
      }),

    listPanels: () => panels,

    listWorks: () => works,
  };
}

/**
 * Создаёт DB-реализацию порта каталога: загружает активные позиции
 * каталога из БД и строит синхронный `CatalogPort`.
 */
export async function createDbCatalogPort(): Promise<CatalogPort> {
  const items = await db.catalogItem.findMany({
    where: { active: true },
    select: { sku: true, name: true, categoryCode: true, attributes: true, price: true, currency: true },
  });
  return buildCatalogPort(items as ItemRow[]);
}
