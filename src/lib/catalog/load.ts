/**
 * Загрузка JSON-каталога ценообразования (Фаза 3).
 *
 * JSON-файлы лежат в `src/data/catalog/` и наполняются импортом прайсов
 * (см. `scripts/import-price.ts`). Импортируются статически —
 * `resolveJsonModule` включён в tsconfig, бандлер встроит их в сборку.
 */
import pumpsJson from '@/data/catalog/pumps.json';
import collectorsJson from '@/data/catalog/collectors.json';
import panelsJson from '@/data/catalog/panels.json';
import accessoriesJson from '@/data/catalog/accessories.json';
import worksJson from '@/data/catalog/works.json';
import metaJson from '@/data/catalog/meta.json';

import type {
  Catalog,
  CatalogAccessory,
  CatalogCollector,
  CatalogPanel,
  CatalogPump,
  CatalogWork,
  PriceMeta,
} from './types';

let cached: Catalog | null = null;

/** Читает JSON-файлы каталога и возвращает единый объект (кешируется). */
export function loadCatalog(): Catalog {
  if (cached) return cached;
  cached = {
    pumps: pumpsJson as CatalogPump[],
    collectors: collectorsJson as CatalogCollector[],
    panels: panelsJson as CatalogPanel[],
    accessories: accessoriesJson as CatalogAccessory[],
    works: worksJson as CatalogWork[],
    meta: metaJson as PriceMeta[],
  };
  return cached;
}
