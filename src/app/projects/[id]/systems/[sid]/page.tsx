'use client';

import { use } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, IconArrowLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { Wizard } from '@/components/wizard/Wizard';
import { useProjectsStore } from '@/lib/store';
import { systemTypeLabel } from '@/lib/format';

export default function SystemWizardPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = use(params);
  const project = useProjectsStore((s) => s.findById(id));
  const system = project?.systems.find((x) => x.id === sid);

  if (!project || !system) {
    return (
      <>
        <PageHeader title="Система не найдена" actions={
          <Link href="/projects" style={{ display: 'inline-flex' }}>
            <Button variant="ghost" leftIcon={<IconArrowLeft />}>К проектам</Button>
          </Link>
        }/>
        <Card>Возможно, она была удалена.</Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <>
            {system.name}
            <Badge variant="info" size="lg">{systemTypeLabel(system.type)}</Badge>
          </>
        }
        subtitle={
          <>Проект: <Link href={`/projects/${project.id}`}>{project.name}</Link></>
        }
        actions={
          <Link href={`/projects/${project.id}`} style={{ display: 'inline-flex' }}>
            <Button variant="ghost" leftIcon={<IconArrowLeft />}>К проекту</Button>
          </Link>
        }
      />
      <Wizard projectId={project.id} systemId={system.id} />
    </>
  );
}
