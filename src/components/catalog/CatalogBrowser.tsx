'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconPackage,
  Input,
  Table,
  Tabs,
} from '@/components/ui';

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
  page,
  pageSize,
  total,
  activeCategory,
  search,
}: {
  items: CatalogItemRow[];
  categories: CategoryTab[];
  page: number;
  pageSize: number;
  total: number;
  activeCategory: string;
  search: string;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);

  /** Перейти по URL с новыми параметрами фильтра/страницы. */
  function navigate(params: { category?: string; search?: string; page?: number }) {
    const category = params.category ?? activeCategory;
    const s = params.search ?? searchInput;
    const p = params.page ?? 1;
    const qs = new URLSearchParams();
    if (category && category !== 'ALL') qs.set('category', category);
    if (s.trim()) qs.set('search', s.trim());
    if (p > 1) qs.set('page', String(p));
    const query = qs.toString();
    router.push(`/catalog${query ? `?${query}` : ''}`);
  }

  // Дебаунс поиска: пушим URL через 450 мс после остановки ввода.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (searchInput.trim() !== search.trim()) {
        navigate({ search: searchInput, page: 1 });
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const tabs = [
    { key: 'ALL', label: 'Все', count: categories.reduce((s, c) => s + c.count, 0) },
    ...categories.map((c) => ({ key: c.code, label: c.name, count: c.count })),
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tabs
          tabs={tabs}
          active={activeCategory}
          onChange={(k) => navigate({ category: k, page: 1 })}
        />
      </div>
      <div style={{ marginBottom: 16, maxWidth: 380 }}>
        <Input
          placeholder="Поиск по артикулу или наименованию"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPackage />}
            title="Позиции не найдены"
            description="Измените фильтр или импортируйте прайс"
          />
        </Card>
      ) : (
        <>
          <Table<CatalogItemRow>
            getRowKey={(r) => r.id}
            rows={items}
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
              { key: 'name', header: 'Наименование', render: (r) => r.name },
              {
                key: 'mfr',
                header: 'Производитель',
                render: (r) => (
                  <span style={{ color: 'var(--muted)' }}>{r.manufacturerName}</span>
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              fontSize: 13,
              color: 'var(--muted)',
            }}
          >
            <span>
              {from}–{to} из {total.toLocaleString('ru-RU')}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => navigate({ page: page - 1 })}
              >
                Назад
              </Button>
              <span>
                стр. {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => navigate({ page: page + 1 })}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
