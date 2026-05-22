import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Card,
  EmptyState,
  IconBuilding,
  IconPlus,
  LinkTable,
} from '@/components/ui';
import { getClients } from '@/server/services/clients';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type ClientRow = Awaited<ReturnType<typeof getClients>>[number];

export default async function ClientsPage() {
  const clients = await getClients();

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

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBuilding />}
            title="Клиентов пока нет"
            description="Добавьте первого контрагента, чтобы создавать проекты"
            action={
              <Link href="/clients/new" style={{ display: 'inline-flex' }}>
                <Button leftIcon={<IconPlus />}>Добавить клиента</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <LinkTable<ClientRow>
          getRowKey={(c) => c.id}
          getRowHref={(c) => `/clients/${c.id}`}
          rows={clients}
          columns={[
            {
              key: 'name',
              header: 'Клиент',
              render: (c) => (
                <div>
                  <div className={styles.cellTitle}>{c.shortName}</div>
                  {c.fullName && <div className={styles.muted}>{c.fullName}</div>}
                </div>
              ),
            },
            {
              key: 'inn',
              header: 'ИНН',
              width: 160,
              render: (c) =>
                c.inn ? (
                  <span className={styles.cellInn}>{c.inn}</span>
                ) : (
                  <span className={styles.muted}>—</span>
                ),
            },
            {
              key: 'contact',
              header: 'Контакт',
              render: (c) =>
                c.contactName ? (
                  <div>
                    <div>{c.contactName}</div>
                    {c.phone && <div className={styles.muted}>{c.phone}</div>}
                  </div>
                ) : (
                  <span className={styles.muted}>—</span>
                ),
            },
            {
              key: 'email',
              header: 'Email',
              render: (c) =>
                c.email ? c.email : <span className={styles.muted}>—</span>,
            },
          ]}
        />
      )}
    </>
  );
}
