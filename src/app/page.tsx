'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRub, formatRubShort, projectStatusLabel } from '@/lib/format';
import {
  Badge, Button, Card, Table, IconPlus, IconUpload, IconFolder, IconBuilding, IconFile, IconDroplet
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import styles from './page.module.css';

export default function DashboardPage() {
  const clients = useClientsStore((s) => s.clients);
  const projects = useProjectsStore((s) => s.projects);

  const stats = useMemo(() => {
    const inProgress = projects.filter((p) => p.status === 'in_progress' || p.status === 'draft' || p.status === 'ready').length;
    const ready = projects.filter((p) => p.status === 'sent' || p.status === 'ready' || p.status === 'won').length;

    let totalSum = 0;
    const rows = [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((p) => {
        const cost = p.systems.reduce((s, sys) => s + (sys.totalCost ?? compute(sys).totalCost), 0);
        totalSum += cost;
        return { project: p, cost };
      });

    return {
      clients: clients.length,
      totalProjects: projects.length,
      inProgress,
      ready,
      totalSum,
      rows
    };
  }, [clients, projects]);

  return (
    <>
      <PageHeader
        title="Конфигуратор водных систем"
        subtitle="Загрузите ТЗ, пройдите wizard, получите ТКП за минуты вместо часов"
        actions={
          <>
            <Link href="/projects" style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconUpload />}>
                Загрузить ТЗ
              </Button>
            </Link>
            <Link href="/projects/new" style={{ display: 'inline-flex' }}>
              <Button leftIcon={<IconPlus />}>
                Новый проект
              </Button>
            </Link>
          </>
        }
      />

      <div className={styles.kpiGrid}>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}><IconBuilding /></div>
          <span className={styles.kpiLabel}>Клиентов</span>
          <span className={styles.kpiValue}>{stats.clients}</span>
          <span className={styles.kpiHint}>База контрагентов</span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}><IconFolder /></div>
          <span className={styles.kpiLabel}>Проектов</span>
          <span className={styles.kpiValue}>{stats.totalProjects}</span>
          <span className={styles.kpiHint}>{stats.inProgress} в работе · {stats.ready} готовых</span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}><IconFile /></div>
          <span className={styles.kpiLabel}>Готовых ТКП</span>
          <span className={styles.kpiValue}>{stats.ready}</span>
          <span className={styles.kpiHint}>Можно отправлять клиентам</span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}><IconDroplet /></div>
          <span className={styles.kpiLabel}>Σ закупки</span>
          <span className={styles.kpiValue}>{formatRubShort(stats.totalSum)}</span>
          <span className={styles.kpiHint}>По всем активным проектам</span>
        </div>
      </div>

      <Card
        title="Проекты"
        subtitle={`${stats.totalProjects} в портфеле, обновлены в порядке последних изменений`}
      >
        <Table
          getRowKey={(r) => r.project.id}
          rows={stats.rows}
          onRowClick={(r) => {
            window.location.href = `/projects/${r.project.id}`;
          }}
          columns={[
            {
              key: 'name',
              header: 'Проект',
              render: (r) => (
                <div className={styles.projectCell}>
                  <div className={styles.projectName}>{r.project.name}</div>
                  <div className={styles.projectObject}>{r.project.object.name}</div>
                </div>
              ),
            },
            {
              key: 'client',
              header: 'Клиент',
              render: (r) => {
                const c = clients.find((x) => x.id === r.project.clientId);
                return (
                  <div className={styles.clientCell}>
                    <span className={styles.clientName}>{c?.shortName ?? '—'}</span>
                    {c?.inn && <span className={styles.clientMeta}>ИНН {c.inn}</span>}
                  </div>
                );
              },
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
              render: (r) => <span className={styles.numCell}>{r.project.systems.length}</span>,
            },
            {
              key: 'cost',
              header: 'Σ закупки',
              align: 'right',
              render: (r) => <span className={styles.numCell}>{formatRub(r.cost, { decimals: 0 })}</span>,
            },
          ]}
        />
      </Card>
    </>
  );
}
