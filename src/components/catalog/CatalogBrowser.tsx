'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, IconPackage, Input, Table, Tabs } from '@/components/ui';

export type CatalogItemRow = {
  id: string;
  sku: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  manufacturerName: string;
  price: number | null;
  currency: string | null;
  active: boolean;
};

export type CategoryTab = { code: string; name: string; count: number };

export function CatalogBrowser({
  items,
  categories,
}: {
  items: CatalogItemRow[];
  categories: CategoryTab[];
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');

  const tabs = useMemo(
    () => [
      { key: 'ALL', label: 'Все', count: items.length },
      ...categories.map((c) => ({
        key: c.code,
        label: c.name,
        count: c.count,
      })),
    ],
    [items.length, categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (category !== 'ALL' && it.categoryCode !== category) return false;
      if (!q) return true;
      return (
        it.sku.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        it.manufacturerName.toLowerCase().includes(q)
      );
    });
  }, [items, search, category]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tabs tabs={tabs} active={category} onChange={setCategory} />
      </div>
      <div style={{ marginBottom: 16, maxWidth: 380 }}>
        <Input
          placeholder="Поиск по артикулу, наименованию, производителю"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPackage />}
            title="Позиции не найдены"
            description="Измените фильтр или импортируйте прайс"
          />
        </Card>
      ) : (
        <Table<CatalogItemRow>
          getRowKey={(r) => r.id}
          rows={filtered}
          columns={[
            {
              key: 'sku',
              header: 'Артикул',
              render: (r) => (
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {r.sku}
                </span>
              ),
            },
            {
              key: 'name',
              header: 'Наименование',
              render: (r) => r.name,
            },
            {
              key: 'mfr',
              header: 'Производитель',
              render: (r) => (
                <span style={{ color: 'var(--muted)' }}>
                  {r.manufacturerName}
                </span>
              ),
            },
            {
              key: 'cat',
              header: 'Категория',
              render: (r) => <Badge variant="info">{r.categoryName}</Badge>,
            },
            {
              key: 'price',
              header: 'Цена',
              align: 'right',
              render: (r) =>
                r.price != null ? (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.price.toLocaleString('ru-RU')} {r.currency ?? ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>—</span>
                ),
            },
          ]}
        />
      )}
    </>
  );
}
