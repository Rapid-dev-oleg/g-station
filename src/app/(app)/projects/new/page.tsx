import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, EmptyState, IconBuilding } from '@/components/ui';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { requireUser } from '@/server/auth';
import { getClients } from '@/server/services/clients';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const [user, clients, sp] = await Promise.all([
    requireUser(),
    getClients(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Новый проект"
        subtitle="Выберите клиента и опишите объект"
      />
      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBuilding />}
            title="Сначала добавьте клиента"
            description="Проект всегда привязан к контрагенту"
            action={
              <Link href="/clients/new" style={{ display: 'inline-flex' }}>
                <Button>Создать клиента</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <ProjectForm
          ownerId={user.id}
          clients={clients.map((c) => ({ id: c.id, shortName: c.shortName }))}
          presetClientId={sp.clientId}
        />
      )}
    </>
  );
}
