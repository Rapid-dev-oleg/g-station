'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRub, projectStatusLabel, clientTagLabel } from '@/lib/format';
import {
  Badge, Button, Card, EmptyState, IconArrowLeft, IconEdit, IconFolder, IconMail, IconPhone, IconPlus, Table
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import styles from './page.module.css';

export default function ClientCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const client = useClientsStore((s) => s.findById(id));
  const allProjects = useProjectsStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.clientId === id), [allProjects, id]);

  const portfolio = useMemo(
    () =>
      projects.map((p) => ({
        project: p,
        cost: p.systems.reduce((s, sys) => s + (sys.totalCost ?? compute(sys).totalCost), 0),
      })),
    [projects]
  );

  if (!client) {
    return (
      <Card>
        <EmptyState
          title="Клиент не найден"
          description="Возможно, ссылка устарела"
          action={
            <Link href="/clients" style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconArrowLeft />}>К списку клиентов</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={client.shortName}
        subtitle={client.fullName}
        actions={
          <>
            <Link href="/clients" style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>К списку</Button>
            </Link>
            <Link href={`/clients/${client.id}/edit`} style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconEdit />}>Редактировать</Button>
            </Link>
          </>
        }
      />

      <div className={styles.twoCol}>
        <Card title="Реквизиты">
          <dl className={styles.detail}>
            <dt>ИНН</dt>
            <dd>{client.inn}</dd>
            {client.kpp && (
              <>
                <dt>КПП</dt>
                <dd>{client.kpp}</dd>
              </>
            )}
            {client.ogrn && (
              <>
                <dt>ОГРН</dt>
                <dd>{client.ogrn}</dd>
              </>
            )}
            <dt>Юр. форма</dt>
            <dd>{client.legalForm}</dd>
            <dt>Юр. адрес</dt>
            <dd>{client.legalAddress}</dd>
            {client.postAddress && (
              <>
                <dt>Почт. адрес</dt>
                <dd>{client.postAddress}</dd>
              </>
            )}
            {client.bankAccount && (
              <>
                <dt>Банк</dt>
                <dd>{client.bankAccount.bankName}</dd>
                <dt>БИК</dt>
                <dd>{client.bankAccount.bik}</dd>
                <dt>Р/счёт</dt>
                <dd>{client.bankAccount.account}</dd>
              </>
            )}
          </dl>
          {client.tags && client.tags.length > 0 && (
            <div className={styles.tagRow}>
              {client.tags.map((t) => (
                <Badge key={t} variant="info">{clientTagLabel(t)}</Badge>
              ))}
            </div>
          )}
          {client.note && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--warning-bg)', borderRadius: 8, fontSize: 13 }}>
              <strong>Заметка:</strong> {client.note}
            </div>
          )}
        </Card>

        <Card title="Контакты" subtitle={`${client.contacts.length} чел.`}>
          {client.contacts.length === 0 ? (
            <div className={styles.muted}>Контакты не указаны</div>
          ) : (
            client.contacts.map((c) => (
              <div key={c.id} className={styles.contactBlock}>
                <div className={styles.contactName}>{c.fullName}</div>
                <div className={styles.contactMeta}>
                  {c.position && <span>{c.position}</span>}
                  {c.representativeOrg && <span>{c.representativeOrg}</span>}
                  {c.phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <IconPhone width={14} height={14} /> {c.phone}
                    </span>
                  )}
                  {c.email && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <IconMail width={14} height={14} /> {c.email}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <h2 className={styles.sectionTitle}>
        Проекты клиента
        <Link
          href={`/projects/new?clientId=${client.id}`}
          style={{ display: 'inline-flex', marginLeft: 16, verticalAlign: 'middle' }}
        >
          <Button size="sm" leftIcon={<IconPlus />}>Новый проект</Button>
        </Link>
      </h2>

      {portfolio.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFolder />}
            title="У клиента пока нет проектов"
            description="Создайте новый проект — мы предзаполним поля клиента автоматически"
            action={
              <Link href={`/projects/new?clientId=${client.id}`} style={{ display: 'inline-flex' }}>
                <Button leftIcon={<IconPlus />}>Создать проект</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Table
          getRowKey={(r) => r.project.id}
          rows={portfolio}
          onRowClick={(r) => router.push(`/projects/${r.project.id}`)}
          columns={[
            { key: 'name', header: 'Проект', render: (r) => <span style={{ fontWeight: 500 }}>{r.project.name}</span> },
            { key: 'object', header: 'Объект', render: (r) => <span className={styles.muted}>{r.project.object.name}</span> },
            {
              key: 'status',
              header: 'Статус',
              render: (r) => {
                const s = projectStatusLabel(r.project.status);
                return <Badge variant={s.variant} withDot>{s.label}</Badge>;
              },
            },
            { key: 'systems', header: 'Систем', align: 'center', render: (r) => r.project.systems.length },
            { key: 'cost', header: 'Σ закупки', align: 'right', render: (r) => formatRub(r.cost, { decimals: 0 }) },
          ]}
        />
      )}
    </>
  );
}
