import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconUpload } from '@/components/ui';
import {
  CatalogBrowser,
  type CatalogItemRow,
  type CategoryTab,
} from '@/components/catalog/CatalogBrowser';
import { getCategories, queryItems, countItems } from '@/server/services/catalog';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const category = sp.category && sp.category !== 'ALL' ? sp.category : undefined;
  const search = sp.search?.trim() || undefined;

  const filter = { activeOnly: false, categoryCode: category, search };

  const [items, total, categories] = await Promise.all([
    queryItems({ ...filter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    countItems(filter),
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
      <CatalogBrowser
        items={rows}
        categories={catTabs}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        activeCategory={sp.category ?? 'ALL'}
        search={sp.search ?? ''}
      />
    </>
  );
}
