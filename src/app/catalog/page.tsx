'use client';

import { useMemo, useState } from 'react';
import { Badge, Input, Select, Table, Tabs } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { ACCESSORIES, BLOCK_BOXES, COLLECTORS, PANELS, PUMPS, VFDS } from '@/lib/catalog';
import { formatRub } from '@/lib/format';
import styles from './page.module.css';

const TABS = [
  { key: 'pumps', label: 'Насосы' },
  { key: 'panels', label: 'Шкафы' },
  { key: 'vfds', label: 'ЧРП' },
  { key: 'collectors', label: 'Коллекторы' },
  { key: 'accessories', label: 'Аксессуары' },
  { key: 'blockboxes', label: 'Блок-боксы' },
];

export default function CatalogPage() {
  const [tab, setTab] = useState('pumps');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  const brands = useMemo(() => [...new Set(PUMPS.map((p) => p.brand))], []);

  return (
    <>
      <PageHeader
        title="Каталог оборудования"
        subtitle="Реальные SKU из выходных файлов архива — цены, диапазоны, скидки"
      />

      <div className={styles.tabsWrap}>
        <Tabs tabs={TABS.map((t) => ({ ...t, count: getCount(t.key) }))} active={tab} onChange={setTab} />
      </div>

      <div className={styles.toolbar}>
        <Input className={styles.search} placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {tab === 'pumps' && (
          <Select
            className={styles.filter}
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            options={[{ value: '', label: 'Все бренды' }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
        )}
      </div>

      {tab === 'pumps' && (
        <Table
          getRowKey={(p) => p.sku}
          rows={PUMPS.filter((p) =>
            (!brandFilter || p.brand === brandFilter) &&
            (!search || `${p.brand} ${p.model}`.toLowerCase().includes(search.toLowerCase()))
          )}
          columns={[
            { key: 'sku', header: 'SKU', render: (p) => <span className={styles.mono}>{p.sku}</span> },
            { key: 'model', header: 'Модель', render: (p) => (
              <div>
                <div className={styles.cellTitle}>{p.model}</div>
                <div className={styles.muted}>{p.brand}</div>
              </div>
            )},
            { key: 'apply', header: 'Применение', render: (p) => p.applicableFor.map((a) => <Badge key={a} variant="info" className="" >{a}</Badge>) },
            { key: 'q', header: 'Q, м³/ч', align: 'center', render: (p) => `${p.Qmin}–${p.Qmax}` },
            { key: 'h', header: 'H, м', align: 'center', render: (p) => `${p.Hmin}–${p.Hmax}` },
            { key: 'pwr', header: 'P, кВт', align: 'center', render: (p) => p.power },
            { key: 'price', header: 'Цена', align: 'right', render: (p) => <span className={styles.numCell}>{formatRub(p.unitPriceRub, { decimals: 0 })}</span> },
            { key: 'disc', header: 'Скидка', align: 'right', render: (p) => `${p.defaultDiscountPct}%` },
          ]}
        />
      )}

      {tab === 'panels' && (
        <Table
          getRowKey={(p) => p.sku}
          rows={PANELS.filter((p) => !search || p.model.toLowerCase().includes(search.toLowerCase()))}
          columns={[
            { key: 'sku', header: 'SKU', render: (p) => <span className={styles.mono}>{p.sku}</span> },
            { key: 'model', header: 'Модель', render: (p) => <div className={styles.cellTitle}>{p.model}</div> },
            { key: 'apply', header: 'Тип', render: (p) => p.applicableFor.map((a) => <Badge key={a} variant="info">{a}</Badge>) },
            { key: 'pumps', header: 'Насосов', align: 'center', render: (p) => p.pumpsCount },
            { key: 'power', header: 'P, кВт', align: 'center', render: (p) => p.totalPower },
            { key: 'outdoor', header: 'Уличный', align: 'center', render: (p) => (p.outdoor ? 'Да' : '—') },
            { key: 'price', header: 'Цена', align: 'right', render: (p) => <span className={styles.numCell}>{formatRub(p.unitPriceRub, { decimals: 0 })}</span> },
            { key: 'disc', header: 'Скидка', align: 'right', render: (p) => `${p.defaultDiscountPct}%` },
          ]}
        />
      )}

      {tab === 'vfds' && (
        <Table
          getRowKey={(v) => v.sku}
          rows={VFDS.filter((v) => !search || v.model.toLowerCase().includes(search.toLowerCase()))}
          columns={[
            { key: 'sku', header: 'SKU', render: (v) => <span className={styles.mono}>{v.sku}</span> },
            { key: 'model', header: 'Модель', render: (v) => (
              <div>
                <div className={styles.cellTitle}>{v.model}</div>
                <div className={styles.muted}>{v.brand}</div>
              </div>
            )},
            { key: 'power', header: 'P, кВт', align: 'center', render: (v) => v.power },
            { key: 'ip', header: 'IP', align: 'center', render: (v) => v.ipRating ?? '—' },
            { key: 'price', header: 'Цена', align: 'right', render: (v) => <span className={styles.numCell}>{formatRub(v.unitPriceRub, { decimals: 0 })}</span> },
            { key: 'disc', header: 'Скидка', align: 'right', render: (v) => `${v.defaultDiscountPct}%` },
          ]}
        />
      )}

      {tab === 'collectors' && (
        <Table
          getRowKey={(c) => c.sku}
          rows={COLLECTORS.filter((c) => !search || c.model.toLowerCase().includes(search.toLowerCase()))}
          columns={[
            { key: 'sku', header: 'SKU', render: (c) => <span className={styles.mono}>{c.sku}</span> },
            { key: 'model', header: 'Модель', render: (c) => (
              <div>
                <div className={styles.cellTitle}>{c.model}</div>
                <div className={styles.muted}>{c.description}</div>
              </div>
            )},
            { key: 'd', header: 'DN', align: 'center', render: (c) => c.diameter },
            { key: 'b', header: 'Веток', align: 'center', render: (c) => c.branches },
            { key: 'price', header: 'Цена материала', align: 'right', render: (c) => <span className={styles.numCell}>{formatRub(c.unitPriceRub, { decimals: 0 })}</span> },
            { key: 'work', header: 'Работы (сварка+рама)', align: 'right', render: (c) => (
              <span className={styles.numCell}>{formatRub(c.weldingPriceRub + c.frameWeldingPriceRub, { decimals: 0 })}</span>
            )},
          ]}
        />
      )}

      {tab === 'accessories' && (
        <Table
          getRowKey={(a) => a.sku}
          rows={ACCESSORIES.filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))}
          columns={[
            { key: 'sku', header: 'SKU', render: (a) => <span className={styles.mono}>{a.sku}</span> },
            { key: 'name', header: 'Наименование', render: (a) => (
              <div>
                <div className={styles.cellTitle}>{a.name}</div>
                <div className={styles.muted}>{a.vendor}</div>
              </div>
            )},
            { key: 'cat', header: 'Категория', render: (a) => <Badge variant="default">{a.category}</Badge> },
            { key: 'price', header: 'Цена', align: 'right', render: (a) => <span className={styles.numCell}>{formatRub(a.unitPriceRub, { decimals: 0 })}</span> },
            { key: 'disc', header: 'Скидка', align: 'right', render: (a) => `${a.defaultDiscountPct}%` },
          ]}
        />
      )}

      {tab === 'blockboxes' && (
        <Table
          getRowKey={(b) => b.sku}
          rows={BLOCK_BOXES.filter((b) => !search || b.model.toLowerCase().includes(search.toLowerCase()))}
          columns={[
            { key: 'sku', header: 'SKU', render: (b) => <span className={styles.mono}>{b.sku}</span> },
            { key: 'model', header: 'Модель', render: (b) => <div className={styles.cellTitle}>{b.model}</div> },
            { key: 'variant', header: 'Тип', render: (b) => b.variant },
            { key: 'size', header: 'Размер, м', align: 'center', render: (b) => `${b.sizeLength}×${b.sizeWidth}×${b.sizeHeight}` },
            { key: 'pwr', header: 'Под насос, кВт', align: 'center', render: (b) => b.forPumpPower ? `${b.forPumpPower.min}–${b.forPumpPower.max}` : '—' },
            { key: 'price', header: 'Цена', align: 'right', render: (b) => <span className={styles.numCell}>{formatRub(b.unitPriceRub, { decimals: 0 })}</span> },
          ]}
        />
      )}
    </>
  );
}

function getCount(key: string): number {
  if (key === 'pumps') return PUMPS.length;
  if (key === 'panels') return PANELS.length;
  if (key === 'vfds') return VFDS.length;
  if (key === 'collectors') return COLLECTORS.length;
  if (key === 'accessories') return ACCESSORIES.length;
  if (key === 'blockboxes') return BLOCK_BOXES.length;
  return 0;
}
