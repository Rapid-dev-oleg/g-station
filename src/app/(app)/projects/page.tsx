import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconPlus, IconSparkles } from '@/components/ui';
import {
  ProjectsList,
  type ProjectListRow,
} from '@/components/projects/ProjectsList';
import { getProjects } from '@/server/services/projects';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await getProjects();
  const rows: ProjectListRow[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    objectName: p.objectName,
    status: p.status,
    clientName: p.client.shortName,
    systemsCount: p._count.systems,
  }));

  return (
    <>
      <PageHeader
        title="Проекты"
        subtitle="Все технико-коммерческие предложения и активные расчёты"
        actions={
          <>
            <Link href="/intake" style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconSparkles />}>
                Расчёт из ТЗ
              </Button>
            </Link>
            <Link href="/projects/new" style={{ display: 'inline-flex' }}>
              <Button leftIcon={<IconPlus />}>Новый проект</Button>
            </Link>
          </>
        }
      />
      <ProjectsList projects={rows} />
    </>
  );
}
