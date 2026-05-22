import { PageHeader } from '@/components/layout/PageHeader';
import { IntakeFlow } from '@/components/intake/IntakeFlow';
import { requireUser } from '@/server/auth';
import { getProjects } from '@/server/services/projects';

export const dynamic = 'force-dynamic';

/**
 * «Новый расчёт из ТЗ» — шаг 1 расчётного конвейера.
 * Загрузка документа ТЗ → разбор ИИ → ревью карточки → создание системы.
 */
export default async function IntakePage() {
  const [user, projects] = await Promise.all([requireUser(), getProjects()]);

  return (
    <>
      <PageHeader
        title="Новый расчёт из ТЗ"
        subtitle="Загрузите документ технического задания — система извлечёт карточку параметров"
      />
      <IntakeFlow
        ownerId={user.id}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          clientName: p.client.shortName,
        }))}
      />
    </>
  );
}
