import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconUpload } from '@/components/ui';
import {
  CatalogBrowser,
  type CatalogItemRow,
  type CategoryTab,
} from '@/components/catalog/CatalogBrowser';
import { getCategories, queryItems } from '@/server/services/catalog';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const [items, categories] = await Promise.all([
    queryItems({ activeOnly: false }),
    getCategories(),
  ]);

  const rows: CatalogItemRow[] = items.map((it) => ({
    id: it.id,
    sku: it.sku,
    name: it.name,
    categoryCode: it.categoryCode,
    categoryName: it.category.name,
    manufacturerName: it.manufacturer.name,
    price: it.price,
    currency: it.currency,
    active: it.active,
  }));

  const catTabs: CategoryTab[] = categories.map((c) => ({
    code: c.code,
    name: c.name,
    count: c._count.items,
  }));

  return (
    <>
      <PageHeader
        title="Каталог оборудования"
        subtitle="Позиции из импортированных прайсов — насосы, шкафы, коллекторы"
        actions={
          <Link href="/catalog/import" style={{ display: 'inline-flex' }}>
            <Button variant="secondary" leftIcon={<IconUpload />}>
              Импорт прайса
            </Button>
          </Link>
        }
      />
      <CatalogBrowser items={rows} categories={catTabs} />
    </>
  );
}
