import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  IconBuilding,
  IconDroplet,
  IconFile,
  IconFolder,
  IconPlus,
  LinkTable,
} from '@/components/ui';
import { formatRubShort } from '@/lib/format';
import { projectStatusLabel } from '@/lib/format/labels';
import { getClients } from '@/server/services/clients';
import { getProjects } from '@/server/services/projects';
import { db } from '@/server/db';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];

export default async function DashboardPage() {
  const [clients, projects, priceAgg] = await Promise.all([
    getClients(),
    getProjects(),
    db.system.aggregate({ _sum: { clientPrice: true } }),
  ]);

  const readyCount = projects.filter(
    (p) => p.status === 'READY' || p.status === 'SENT' || p.status === 'WON',
  ).length;
  const inProgress = projects.filter(
    (p) => p.status === 'DRAFT' || p.status === 'IN_PROGRESS',
  ).length;
  const totalSum = priceAgg._sum.clientPrice ?? 0;
  const systemsCount = projects.reduce((s, p) => s + p._count.systems, 0);

  return (
    <>
      <PageHeader
        title="Дашборд"
        subtitle="Расчёт пожарных насосных станций — портфель проектов «Гидрострой-НН»"
        actions={
          <>
            <Link href="/clients/new" style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconPlus />}>
                Клиент
              </Button>
            </Link>
            <Link href="/projects/new" style={{ display: 'inline-flex' }}>
              <Button leftIcon={<IconPlus />}>Новый проект</Button>
            </Link>
          </>
        }
      />

      <div className={styles.kpiGrid}>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}>
            <IconBuilding />
          </div>
          <span className={styles.kpiLabel}>Клиентов</span>
          <span className={styles.kpiValue}>{clients.length}</span>
          <span className={styles.kpiHint}>База контрагентов</span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}>
            <IconFolder />
          </div>
          <span className={styles.kpiLabel}>Проектов</span>
          <span className={styles.kpiValue}>{projects.length}</span>
          <span className={styles.kpiHint}>
            {inProgress} в работе · {readyCount} готовых
          </span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}>
            <IconFile />
          </div>
          <span className={styles.kpiLabel}>Готовых ТКП</span>
          <span className={styles.kpiValue}>{readyCount}</span>
          <span className={styles.kpiHint}>Можно отправлять клиентам</span>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon}>
            <IconDroplet />
          </div>
          <span className={styles.kpiLabel}>Σ по ТКП</span>
          <span className={styles.kpiValue}>{formatRubShort(totalSum)}</span>
          <span className={styles.kpiHint}>{systemsCount} систем в расчёте</span>
        </div>
      </div>

      <Card
        title="Последние проекты"
        subtitle={`${projects.length} в портфеле — по дате обновления`}
      >
        <LinkTable<ProjectRow>
          getRowKey={(p) => p.id}
          getRowHref={(p) => `/projects/${p.id}`}
          rows={projects.slice(0, 12)}
          emptyState="Проектов пока нет"
          columns={[
            {
              key: 'name',
              header: 'Проект',
              render: (p) => (
                <div>
                  <div className={styles.cellTitle}>{p.name}</div>
                  <div className={styles.muted}>{p.objectName}</div>
                </div>
              ),
            },
            {
              key: 'client',
              header: 'Клиент',
              render: (p) => (
                <span className={styles.muted}>{p.client.shortName}</span>
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
                <span className={styles.numCell}>{p._count.systems}</span>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
