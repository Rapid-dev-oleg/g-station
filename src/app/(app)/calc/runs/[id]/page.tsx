import { PageHeader } from '@/components/layout/PageHeader';
import { getRun } from '@/server/actions/pipeline';
import { RunView } from '@/components/calc/RunView';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Прогон расчётного конвейера (β): шаги в одной сессии агента. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  return (
    <>
      <PageHeader title="Расчёт по конвейеру" subtitle="Шаги выполняются по очереди в одной сессии агента (β)" />
      <RunView run={run} />
    </>
  );
}
