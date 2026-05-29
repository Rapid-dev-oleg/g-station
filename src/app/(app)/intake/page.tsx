import { PageHeader } from '@/components/layout/PageHeader';
import { IntakeFlow } from '@/components/intake/IntakeFlow';
import { requireUser } from '@/server/auth';
import { getProjects, getProjectById } from '@/server/services/projects';

export const dynamic = 'force-dynamic';

/**
 * «Новый расчёт из ТЗ» — шаг 1 расчётного конвейера.
 * Загрузка документа ТЗ → разбор ИИ → ревью карточки → создание системы.
 *
 * С `?projectId=<id>` — ТЗ привязывается к существующему проекту (вызов
 * со страницы проекта), выбор проекта фиксируется.
 */
export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const [user, projects] = await Promise.all([requireUser(), getProjects()]);

  const locked = projectId ? await getProjectById(projectId) : null;

  return (
    <>
      <PageHeader
        title="Новый расчёт из ТЗ"
        subtitle={
          locked
            ? `Проект: ${locked.name} — ТЗ будет привязано к нему`
            : 'Загрузите документ технического задания — система извлечёт карточку параметров'
        }
      />
      <IntakeFlow
        ownerId={user.id}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          clientName: p.client.shortName,
        }))}
        lockedProjectId={locked?.id}
        lockedProjectName={locked?.name}
      />
    </>
  );
}
