import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconArrowLeft, IconArrowRight } from '@/components/ui';
import { SystemWizard } from '@/components/wizard/SystemWizard';
import { KimiCalcPanel } from '@/components/calc/KimiCalcPanel';
import { getSystem } from '@/server/services/systems';

export const dynamic = 'force-dynamic';

export default async function SystemWizardPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const system = await getSystem(sid);
  if (!system || system.projectId !== id) notFound();

  const station = system.dossier.stations[0];
  if (!station) notFound();

  return (
    <>
      <PageHeader
        title={system.name}
        subtitle={`${system.type.name} · карточка системы`}
        actions={
          <>
            <Link href={`/projects/${id}`} style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>
                К проекту
              </Button>
            </Link>
            <Link
              href={`/projects/${id}/systems/${sid}/calc`}
              style={{ display: 'inline-flex' }}
            >
              <Button variant="secondary" rightIcon={<IconArrowRight />}>
                К расчёту
              </Button>
            </Link>
          </>
        }
      />
      <SystemWizard
        systemId={sid}
        projectId={id}
        initialMeta={system.dossier.meta}
        initialInput={station.input}
      />
      <div style={{ marginTop: 20 }}>
        <KimiCalcPanel
          systemId={sid}
          initialOutput={
            (system.kimiCalc as { output?: string } | null | undefined)?.output
          }
        />
      </div>
    </>
  );
}
