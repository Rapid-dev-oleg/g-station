'use client';

import { use } from 'react';
import { ClientForm } from '@/components/clients/ClientForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { useClientsStore } from '@/lib/store';

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = useClientsStore((s) => s.findById(id));

  if (!client) {
    return (
      <>
        <PageHeader title="Клиент не найден" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Редактирование клиента" subtitle={client.shortName} />
      <ClientForm initial={client} redirectTo={`/clients/${client.id}`} />
    </>
  );
}
