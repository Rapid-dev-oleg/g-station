import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconArrowLeft,
  IconEdit,
  IconFolder,
  IconMail,
  IconPhone,
  IconPlus,
  LinkTable,
} from '@/components/ui';
import { projectStatusLabel } from '@/lib/format/labels';
import { getClientById } from '@/server/services/clients';
import styles from '../page.module.css';

export const dynamic = 'force-dynamic';

type ClientWithProjects = NonNullable<Awaited<ReturnType<typeof getClientById>>>;
type ProjectRow = ClientWithProjects['projects'][number];

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  return (
    <>
      <PageHeader
        title={client.shortName}
        subtitle={client.fullName ?? undefined}
        actions={
          <>
            <Link href="/clients" style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>
                К списку
              </Button>
            </Link>
            <Link
              href={`/clients/${client.id}/edit`}
              style={{ display: 'inline-flex' }}
            >
              <Button variant="secondary" leftIcon={<IconEdit />}>
                Редактировать
              </Button>
            </Link>
          </>
        }
      />

      <div className={styles.twoCol}>
        <Card title="Реквизиты">
          <dl className={styles.detail}>
            <dt>Краткое имя</dt>
            <dd>{client.shortName}</dd>
            {client.fullName && (
              <>
                <dt>Полное имя</dt>
                <dd>{client.fullName}</dd>
              </>
            )}
            <dt>ИНН</dt>
            <dd>{client.inn ?? '—'}</dd>
          </dl>
          {client.note && (
            <div className={styles.note}>
              <strong>Заметка:</strong> {client.note}
            </div>
          )}
        </Card>

        <Card title="Контакты">
          {client.contactName || client.phone || client.email ? (
            <div className={styles.contactBlock}>
              {client.contactName && (
                <div className={styles.contactName}>{client.contactName}</div>
              )}
              <div className={styles.contactMeta}>
                {client.phone && (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconPhone width={14} height={14} /> {client.phone}
                  </span>
                )}
                {client.email && (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconMail width={14} height={14} /> {client.email}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.muted}>Контакты не указаны</div>
          )}
        </Card>
      </div>

      <div className={styles.sectionTitle}>
        <h2>Проекты клиента ({client.projects.length})</h2>
        <Link
          href={`/projects/new?clientId=${client.id}`}
          style={{ display: 'inline-flex' }}
        >
          <Button size="sm" leftIcon={<IconPlus />}>
            Новый проект
          </Button>
        </Link>
      </div>

      {client.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFolder />}
            title="У клиента пока нет проектов"
            description="Создайте проект — клиент будет подставлен автоматически"
            action={
              <Link
                href={`/projects/new?clientId=${client.id}`}
                style={{ display: 'inline-flex' }}
              >
                <Button leftIcon={<IconPlus />}>Создать проект</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <LinkTable<ProjectRow>
          getRowKey={(p) => p.id}
          getRowHref={(p) => `/projects/${p.id}`}
          rows={client.projects}
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
          ]}
        />
      )}
    </>
  );
}
