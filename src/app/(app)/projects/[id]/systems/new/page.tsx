import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { NewSystemForm } from '@/components/systems/NewSystemForm';
import { requireUser } from '@/server/auth';
import { getProjectById } from '@/server/services/projects';

export const dynamic = 'force-dynamic';

export default async function NewSystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, user] = await Promise.all([
    getProjectById(id),
    requireUser(),
  ]);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Новая система"
        subtitle={`${project.name} — выберите тип насосной станции`}
      />
      <NewSystemForm projectId={project.id} engineerId={user.id} />
    </>
  );
}
