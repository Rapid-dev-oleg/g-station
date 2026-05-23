/**
 * Чтение каталога оборудования для Server Components.
 * Запросы к `CatalogItem`, `Manufacturer`, `ProductCategory`, `PriceList`.
 */

import type { Prisma } from '@prisma/client';
import { db } from '@/server/db';

/** Фильтр выборки позиций каталога. */
export type CatalogQuery = {
  /** Код категории, напр. 'pumps'. */
  categoryCode?: string;
  /** ID производителя. */
  manufacturerId?: string;
  /** Подстрока для поиска по артикулу/наименованию (регистронезависимо). */
  search?: string;
  /** Только активные позиции (по умолчанию — да). */
  activeOnly?: boolean;
  /** Сколько позиций вернуть (пагинация). */
  take?: number;
  /** Сколько пропустить (пагинация). */
  skip?: number;
};

/** Условие WHERE для выборки/подсчёта позиций каталога. */
function buildWhere(query: CatalogQuery): Prisma.CatalogItemWhereInput {
  const { categoryCode, manufacturerId, search, activeOnly = true } = query;
  const where: Prisma.CatalogItemWhereInput = {};
  if (categoryCode) where.categoryCode = categoryCode;
  if (manufacturerId) where.manufacturerId = manufacturerId;
  if (activeOnly) where.active = true;
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { sku: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** Позиции каталога по фильтру (с пагинацией). Сортировка — производитель, артикул. */
export function queryItems(query: CatalogQuery = {}) {
  return db.catalogItem.findMany({
    where: buildWhere(query),
    include: { manufacturer: true, category: true },
    orderBy: [{ manufacturerId: 'asc' }, { sku: 'asc' }],
    take: query.take,
    skip: query.skip,
  });
}

/** Число позиций каталога по фильтру (для пагинации). */
export function countItems(query: CatalogQuery = {}) {
  return db.catalogItem.count({ where: buildWhere(query) });
}

/** Все производители (с числом позиций каталога). */
export function getManufacturers() {
  return db.manufacturer.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true, priceLists: true } } },
  });
}

/** Все категории продукции (с числом позиций). */
export function getCategories() {
  return db.productCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

/** История импортированных прайсов (свежие — первыми). */
export function getPriceLists() {
  return db.priceList.findMany({
    orderBy: { importedAt: 'desc' },
    include: { manufacturer: true },
  });
}
