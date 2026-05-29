import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconArrowLeft } from '@/components/ui';
import { SystemFlow } from '@/components/system/SystemFlow';
import { getSystem } from '@/server/services/systems';

export const dynamic = 'force-dynamic';

export default async function SystemPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const system = await getSystem(sid);
  if (!system || system.projectId !== id) notFound();

  const station = system.dossier.stations[0];
  if (!station) notFound();

  const kimiCalc = system.kimiCalc as { output?: string } | null | undefined;
  const snapshot = system.approvedSnapshot as { approvedAt?: string } | null | undefined;

  return (
    <>
      <PageHeader
        title={system.name}
        subtitle={`${system.type.name} · расчёт станции`}
        actions={
          <Link href={`/projects/${id}`} style={{ display: 'inline-flex' }}>
            <Button variant="ghost" leftIcon={<IconArrowLeft />}>
              К проекту
            </Button>
          </Link>
        }
      />
      <SystemFlow
        systemId={sid}
        projectId={id}
        status={system.status}
        initialMeta={system.dossier.meta}
        initialInput={station.input}
        initialCalc={kimiCalc?.output}
        approvedAt={snapshot?.approvedAt ?? null}
      />
    </>
  );
}
