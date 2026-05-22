import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, IconArrowLeft, IconEdit } from '@/components/ui';
import { CalcPanel } from '@/components/calc/CalcPanel';
import { systemStatusLabel } from '@/lib/format/labels';
import { allGates } from '@/lib/engine/gates';
import { getSystem } from '@/server/services/systems';

export const dynamic = 'force-dynamic';

export default async function SystemCalcPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const system = await getSystem(sid);
  if (!system || system.projectId !== id) notFound();

  const status = systemStatusLabel(system.status);
  const gates = allGates(system.dossier);

  return (
    <>
      <PageHeader
        title={
          <>
            {system.name}{' '}
            <Badge variant={status.variant} withDot size="lg">
              {status.label}
            </Badge>
          </>
        }
        subtitle={`${system.type.name} · расчёт и подбор оборудования`}
        actions={
          <>
            <Link
              href={`/projects/${id}/systems/${sid}`}
              style={{ display: 'inline-flex' }}
            >
              <Button variant="secondary" leftIcon={<IconEdit />}>
                Карточка системы
              </Button>
            </Link>
            <Link href={`/projects/${id}`} style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>
                К проекту
              </Button>
            </Link>
          </>
        }
      />
      <CalcPanel
        systemId={sid}
        initialDossier={system.dossier}
        initialGates={gates}
        alreadyCalculated={system.status !== 'INPUT'}
      />
    </>
  );
}
