import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconArrowLeft,
  IconArrowRight,
  IconEdit,
  IconFile,
  IconFlame,
  IconFolder,
  IconPlus,
} from '@/components/ui';
import { ProjectStatusControl } from '@/components/projects/ProjectStatusControl';
import { formatRub } from '@/lib/format';
import { projectStatusLabel, systemStatusLabel } from '@/lib/format/labels';
import type { Dossier } from '@/lib/dossier/types';
import { getProjectById } from '@/server/services/projects';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ProjectCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const status = projectStatusLabel(project.status);
  const totalCost = project.systems.reduce(
    (sum, s) => sum + (s.clientPrice ?? s.totalCost ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={
          <>
            <Link href={`/clients/${project.client.id}`}>
              {project.client.shortName}
            </Link>{' '}
            · {project.objectName}
          </>
        }
        actions={
          <>
            <Link href="/projects" style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>
                К проектам
              </Button>
            </Link>
            {project.systems.length > 0 && (
              <Link
                href={`/projects/${project.id}/proposal`}
                style={{ display: 'inline-flex' }}
              >
                <Button variant="secondary" leftIcon={<IconFile />}>
                  ТКП
                </Button>
              </Link>
            )}
            <Link
              href={`/projects/${project.id}/systems/new`}
              style={{ display: 'inline-flex' }}
            >
              <Button leftIcon={<IconPlus />}>Добавить систему</Button>
            </Link>
          </>
        }
      />

      <div className={styles.layout}>
        <div>
          <Card title="Объект" compact style={{ marginBottom: 16 }}>
            <dl className={styles.detail}>
              <dt>Название</dt>
              <dd>{project.objectName}</dd>
              <dt>Клиент</dt>
              <dd>{project.client.shortName}</dd>
              <dt>Срок</dt>
              <dd>
                {project.deadline
                  ? new Date(project.deadline).toLocaleDateString('ru-RU')
                  : '—'}
              </dd>
            </dl>
          </Card>

          <div className={styles.sectionTitle}>
            <h2>Системы ({project.systems.length})</h2>
          </div>

          {project.systems.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconFolder />}
                title="В проекте пока нет систем"
                description="Добавьте насосную станцию для расчёта"
                action={
                  <Link
                    href={`/projects/${project.id}/systems/new`}
                    style={{ display: 'inline-flex' }}
                  >
                    <Button leftIcon={<IconPlus />}>Добавить систему</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <div className={styles.systemList}>
              {project.systems.map((sys) => {
                const dossier = sys.dossier as unknown as Dossier;
                const input = dossier?.stations?.[0]?.input;
                const s = systemStatusLabel(sys.status);
                const cost = sys.clientPrice ?? sys.totalCost ?? null;
                return (
                  <div key={sys.id} className={styles.systemCard}>
                    <div className={styles.systemIcon}>
                      <IconFlame />
                    </div>
                    <div className={styles.systemMain}>
                      <div className={styles.systemName}>{sys.name}</div>
                      <div className={styles.systemMeta}>
                        <Badge variant="info">{sys.type.name}</Badge>
                        <Badge variant={s.variant} withDot>
                          {s.label}
                        </Badge>
                        {input?.Q?.value != null && (
                          <span>
                            Q={(() => {
                              const u = (input.Q.unit ?? '').toLowerCase();
                              if (u.includes('л/с')) return `${Math.round(input.Q.value * 3.6 * 10) / 10} м³/ч`;
                              return `${input.Q.value} ${input.Q.unit ?? 'м³/ч'}`;
                            })()}
                          </span>
                        )}
                        {input?.H?.value != null && (
                          <span>
                            H={(() => {
                              const u = (input.H.unit ?? '').toLowerCase();
                              if (u.includes('бар') || u === 'bar') return `${input.H.value * 10} м`;
                              if (u.includes('мпа') || u === 'mpa') return `${input.H.value * 100} м`;
                              return `${input.H.value} ${input.H.unit ?? 'м'}`;
                            })()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.systemRight}>
                      <div className={styles.systemSum}>
                        {cost != null ? formatRub(cost, { decimals: 0 }) : '—'}
                      </div>
                      <Link
                        href={`/projects/${project.id}/systems/${sys.id}`}
                        style={{ display: 'inline-flex' }}
                      >
                        <Button size="sm" variant="secondary" leftIcon={<IconEdit />}>
                          Карточка
                        </Button>
                      </Link>
                      <Link
                        href={`/projects/${project.id}/systems/${sys.id}/calc`}
                        style={{ display: 'inline-flex' }}
                      >
                        <Button size="sm" rightIcon={<IconArrowRight />}>
                          Расчёт
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className={styles.aside}>
          <Card title="Сводка" compact>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Систем</span>
              <span className={styles.summaryValue}>
                {project.systems.length}
              </span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Σ по ТКП</span>
              <span className={styles.summaryValue}>
                {formatRub(totalCost, { decimals: 0 })}
              </span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Статус</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </Card>

          <Card title="Статус проекта" compact>
            <ProjectStatusControl
              projectId={project.id}
              status={project.status}
            />
            <p
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                marginTop: 10,
              }}
            >
              Смена статуса фиксируется сразу.
            </p>
          </Card>

          <Card title="Заказчик" compact>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {project.client.shortName}
            </div>
            {project.client.inn && (
              <div className={styles.muted} style={{ fontSize: 13 }}>
                ИНН {project.client.inn}
              </div>
            )}
            <Link
              href={`/clients/${project.client.id}`}
              style={{ display: 'block', marginTop: 8, fontSize: 13 }}
            >
              Открыть карточку клиента →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
