import { PageHeader } from '@/components/layout/PageHeader';
import { JobsList } from '@/components/jobs/JobsList';
import { listJobs } from '@/server/actions/jobs';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const jobs = await listJobs(30);
  return (
    <div>
      <PageHeader
        title="Задачи"
        subtitle="Парсинг и расчёты идут в очереди на сервере — переживают уход со страницы"
      />
      <JobsList initial={jobs} />
    </div>
  );
}
