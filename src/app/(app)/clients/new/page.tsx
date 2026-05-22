import { ClientForm } from '@/components/clients/ClientForm';
import { PageHeader } from '@/components/layout/PageHeader';

export default function NewClientPage() {
  return (
    <>
      <PageHeader
        title="Новый клиент"
        subtitle="Заполните реквизиты — потом сможете создать под него проект"
      />
      <ClientForm />
    </>
  );
}
