'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, IconFolder, LinkTable, Tabs } from '@/components/ui';
import { projectStatusLabel } from '@/lib/format/labels';

export type ProjectListRow = {
  id: string;
  name: string;
  objectName: string;
  status: string;
  clientName: string;
  systemsCount: number;
};

const STATUS_TABS = [
  { key: 'ALL', label: 'Все' },
  { key: 'DRAFT', label: 'Черновики' },
  { key: 'IN_PROGRESS', label: 'В работе' },
  { key: 'READY', label: 'Готовые' },
  { key: 'SENT', label: 'Отправленные' },
  { key: 'WON', label: 'Выигранные' },
  { key: 'LOST', label: 'Проигранные' },
];

export function ProjectsList({ projects }: { projects: ProjectListRow[] }) {
  const [status, setStatus] = useState('ALL');

  const tabs = useMemo(
    () =>
      STATUS_TABS.map((t) => ({
        ...t,
        count:
          t.key === 'ALL'
            ? projects.length
            : projects.filter((p) => p.status === t.key).length,
      })),
    [projects],
  );

  const filtered = useMemo(
    () =>
      status === 'ALL'
        ? projects
        : projects.filter((p) => p.status === status),
    [projects, status],
  );

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Tabs tabs={tabs} active={status} onChange={setStatus} />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFolder />}
            title="Проектов в этом статусе нет"
            description="Смените фильтр или создайте новый проект"
          />
        </Card>
      ) : (
        <LinkTable<ProjectListRow>
          getRowKey={(p) => p.id}
          getRowHref={(p) => `/projects/${p.id}`}
          rows={filtered}
          columns={[
            {
              key: 'name',
              header: 'Проект',
              render: (p) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {p.objectName}
                  </div>
                </div>
              ),
            },
            {
              key: 'client',
              header: 'Клиент',
              render: (p) => (
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {p.clientName}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Статус',
              render: (p) => {
                const s = projectStatusLabel(p.status);
                return (
                  <Badge variant={s.variant} withDot>
                    {s.label}
                  </Badge>
                );
              },
            },
            {
              key: 'systems',
              header: 'Систем',
              align: 'center',
              render: (p) => (
                <span
                  style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
                >
                  {p.systemsCount}
                </span>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
