'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRelative, formatRubShort, clientTagLabel } from '@/lib/format';
import { Badge, Button, Card, EmptyState, IconBuilding, IconPlus, Input, Select, Table } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import styles from './page.module.css';

type SortKey = 'turnover' | 'projects' | 'updated' | 'name';
type SortDir = 'asc' | 'desc';

export default function ClientsPage() {
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const projects = useProjectsStore((s) => s.projects);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('turnover');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => c.tags?.forEach((t) => set.add(t)));
    return [...set];
  }, [clients]);

  // Оборот каждого клиента: сумма всех систем во всех его проектах.
  const stats = useMemo(() => {
    const map = new Map<string, { turnover: number; projectsCount: number }>();
    for (const c of clients) {
      map.set(c.id, { turnover: 0, projectsCount: 0 });
    }
    for (const p of projects) {
      const e = map.get(p.clientId);
      if (!e) continue;
      e.projectsCount += 1;
      for (const sys of p.systems) {
        e.turnover += sys.totalCost ?? compute(sys).totalCost;
      }
    }
    return map;
  }, [clients, projects]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = clients.filter((c) => {
      if (tagFilter && !c.tags?.includes(tagFilter as any)) return false;
      if (!q) return true;
      return (
        c.inn.includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q) ||
        c.contacts.some((ct) => ct.fullName.toLowerCase().includes(q))
      );
    });

    const sign = sortDir === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => {
      const sa = stats.get(a.id)!;
      const sb = stats.get(b.id)!;
      if (sortKey === 'turnover') return sign * (sa.turnover - sb.turnover);
      if (sortKey === 'projects') return sign * (sa.projectsCount - sb.projectsCount);
      if (sortKey === 'name') return sign * a.shortName.localeCompare(b.shortName, 'ru');
      return sign * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    });
    return result;
  }, [clients, search, tagFilter, sortKey, sortDir, stats]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className={styles.sortHint}>↕</span>;
    return <span className={styles.sortActive}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <>
      <PageHeader
        title="Клиенты"
        subtitle="База контрагентов — реквизиты, контакты, портфель проектов"
        actions={
          <Link href="/clients/new" style={{ display: 'inline-flex' }}>
            <Button leftIcon={<IconPlus />}>Новый клиент</Button>
          </Link>
        }
      />

      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          placeholder="Поиск по ИНН, названию или контакту"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className={styles.filterSelect}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          options={[{ value: '', label: 'Все теги' }, ...allTags.map((t) => ({ value: t, label: clientTagLabel(t) }))]}
        />
      </div>

      {filteredAndSorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBuilding />}
            title="Клиенты не найдены"
            description="Попробуйте изменить поиск или добавьте нового клиента"
            action={
              <Link href="/clients/new" style={{ display: 'inline-flex' }}>
                <Button leftIcon={<IconPlus />}>Добавить клиента</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Table
          getRowKey={(c) => c.id}
          rows={filteredAndSorted}
          onRowClick={(c) => router.push(`/clients/${c.id}`)}
          columns={[
            {
              key: 'inn',
              header: 'ИНН',
              width: 140,
              render: (c) => <span className={styles.cellInn}>{c.inn}</span>,
            },
            {
              key: 'shortName',
              header: (
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort('name')}>
                  Краткое имя {sortIcon('name')}
                </button>
              ),
              render: (c) => (
                <div>
                  <div className={styles.cellTitle}>{c.shortName}</div>
                  <div className={styles.muted} style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.fullName}
                  </div>
                </div>
              ),
            },
            {
              key: 'tag',
              header: 'Тег',
              render: (c) => (c.tags?.[0] ? <Badge variant="info">{clientTagLabel(c.tags[0])}</Badge> : <span className={styles.muted}>—</span>),
            },
            {
              key: 'contact',
              header: 'Контакт',
              render: (c) => {
                const ct = c.contacts[0];
                if (!ct) return <span className={styles.muted}>—</span>;
                return (
                  <div>
                    <div>{ct.fullName}</div>
                    <div className={styles.muted}>{ct.position ?? ''}</div>
                  </div>
                );
              },
            },
            {
              key: 'projects',
              header: (
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort('projects')}>
                  Проектов {sortIcon('projects')}
                </button>
              ),
              align: 'center',
              render: (c) => <span className={styles.numCell}>{stats.get(c.id)?.projectsCount ?? 0}</span>,
            },
            {
              key: 'turnover',
              header: (
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort('turnover')}>
                  Σ закупки {sortIcon('turnover')}
                </button>
              ),
              align: 'right',
              render: (c) => {
                const t = stats.get(c.id)?.turnover ?? 0;
                return t > 0 ? (
                  <span className={styles.numCell}>{formatRubShort(t)}</span>
                ) : (
                  <span className={styles.muted}>—</span>
                );
              },
            },
            {
              key: 'updated',
              header: (
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort('updated')}>
                  Обновлён {sortIcon('updated')}
                </button>
              ),
              render: (c) => <span className={styles.muted}>{formatRelative(c.updatedAt)}</span>,
            },
          ]}
        />
      )}
    </>
  );
}
