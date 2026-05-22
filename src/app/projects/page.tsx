'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRub, formatRelative, projectStatusLabel } from '@/lib/format';
import { Badge, Button, Card, EmptyState, IconFolder, IconPlus, Input, Select, Table } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import styles from './page.module.css';

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const clients = useClientsStore((s) => s.clients);

  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const enriched = useMemo(
    () =>
      projects.map((p) => ({
        project: p,
        cost: p.systems.reduce((s, sys) => s + (sys.totalCost ?? compute(sys).totalCost), 0),
        client: clients.find((c) => c.id === p.clientId),
        types: [...new Set(p.systems.map((s) => s.type))],
      })),
    [projects, clients]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((row) => {
      if (clientFilter && row.project.clientId !== clientFilter) return false;
      if (statusFilter && row.project.status !== statusFilter) return false;
      if (typeFilter && !row.types.includes(typeFilter as any)) return false;
      if (!q) return true;
      return (
        row.project.name.toLowerCase().includes(q) ||
        row.project.object.name.toLowerCase().includes(q) ||
        row.client?.shortName.toLowerCase().includes(q)
      );
    });
  }, [enriched, search, clientFilter, statusFilter, typeFilter]);

  return (
    <>
      <PageHeader
        title="Проекты"
        subtitle="Все технико-коммерческие предложения и активные расчёты"
        actions={
          <Link href="/projects/new" style={{ display: 'inline-flex' }}>
            <Button leftIcon={<IconPlus />}>Новый проект</Button>
          </Link>
        }
      />

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          placeholder="Поиск по проекту или объекту"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className={styles.filter}
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          options={[{ value: '', label: 'Все клиенты' }, ...clients.map((c) => ({ value: c.id, label: c.shortName }))]}
        />
        <Select
          className={styles.filter}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'Все статусы' },
            { value: 'draft', label: 'Черновик' },
            { value: 'in_progress', label: 'В работе' },
            { value: 'ready', label: 'Готов' },
            { value: 'sent', label: 'Отправлен' },
            { value: 'won', label: 'Выигран' },
            { value: 'lost', label: 'Проигран' },
          ]}
        />
        <Select
          className={styles.filter}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'Все типы систем' },
            { value: 'KNS', label: 'КНС' },
            { value: 'FIRE', label: 'Пожаротушение' },
            { value: 'VNS', label: 'ВНС' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFolder />}
            title="Проекты не найдены"
            description="Сбросьте фильтры или создайте новый проект"
            action={
              <Link href="/projects/new" style={{ display: 'inline-flex' }}>
                <Button leftIcon={<IconPlus />}>Создать проект</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Table
          getRowKey={(r) => r.project.id}
          rows={filtered}
          onRowClick={(r) => router.push(`/projects/${r.project.id}`)}
          columns={[
            {
              key: 'name',
              header: 'Проект',
              render: (r) => (
                <div>
                  <div className={styles.cellTitle}>{r.project.name}</div>
                  <div className={styles.muted} style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.project.object.name}
                  </div>
                </div>
              ),
            },
            {
              key: 'client',
              header: 'Клиент',
              render: (r) => <span className={styles.muted}>{r.client?.shortName ?? '—'}</span>,
            },
            {
              key: 'status',
              header: 'Статус',
              render: (r) => {
                const s = projectStatusLabel(r.project.status);
                return <Badge variant={s.variant} withDot>{s.label}</Badge>;
              },
            },
            {
              key: 'systems',
              header: 'Систем',
              align: 'center',
              render: (r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <span className={styles.numCell}>{r.project.systems.length}</span>
                  <span className={styles.muted}>{r.types.join(', ')}</span>
                </div>
              ),
            },
            {
              key: 'cost',
              header: 'Σ закупки',
              align: 'right',
              render: (r) => <span className={styles.numCell}>{formatRub(r.cost, { decimals: 0 })}</span>,
            },
            {
              key: 'updated',
              header: 'Обновлён',
              render: (r) => <span className={styles.muted}>{formatRelative(r.project.updatedAt)}</span>,
            },
          ]}
        />
      )}
    </>
  );
}
