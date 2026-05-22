import { notFound } from 'next/navigation';
import { ClientForm } from '@/components/clients/ClientForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { getClientById } from '@/server/services/clients';

export const dynamic = 'force-dynamic';

export default async function EditClientPage({
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
        title="Редактирование клиента"
        subtitle={client.shortName}
      />
      <ClientForm
        initial={{
          id: client.id,
          shortName: client.shortName,
          fullName: client.fullName,
          inn: client.inn,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          note: client.note,
        }}
      />
    </>
  );
}
