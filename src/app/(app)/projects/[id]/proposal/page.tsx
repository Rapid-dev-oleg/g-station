/**
 * ФАЗА 6 — страница ТКП проекта.
 *
 * Собирает технико-коммерческое предложение из расчётных дел систем
 * проекта: реквизиты поставщика — из Settings, заказчик — из Client,
 * перечень систем со спецификацией и ценами — из dossier выбранных
 * вариантов. Печатная вёрстка A4 (PDF — через печать браузера).
 */

import { notFound } from 'next/navigation';
import {
  Proposal,
  ProposalActions,
  buildProposalData,
  collectNorms,
  type ProposalSystemInput,
} from '@/components/proposal';
import type { ExportMeta } from '@/components/proposal';
import { formatDateLong } from '@/lib/format';
import { getProjectForProposal } from '@/server/services/projects';
import { getSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, settings] = await Promise.all([
    getProjectForProposal(id),
    getSettings(),
  ]);
  if (!project) notFound();

  // ── Сборка модели ТКП из расчётных дел систем ──────────────────────────
  const systemInputs: ProposalSystemInput[] = project.systems.map((s) => ({
    id: s.id,
    name: s.name,
    typeName: s.type.name,
    dossier: s.dossier,
  }));
  const data = buildProposalData(systemInputs);
  const norms = collectNorms(systemInputs);

  // ── Реквизиты ──────────────────────────────────────────────────────────
  const today = new Date().toISOString();
  const dateLong = formatDateLong(today);
  const proposalId = `${project.id.slice(-6).toUpperCase()}/${new Date().getFullYear()}`;

  const company = {
    name: settings?.companyName ?? 'Поставщик',
    inn: settings?.companyInn ?? undefined,
    address: settings?.companyAddress ?? undefined,
    phone: settings?.companyPhone ?? undefined,
    email: settings?.companyEmail ?? undefined,
  };
  const client = {
    name: project.client.shortName,
    inn: project.client.inn ?? undefined,
    contactName: project.client.contactName ?? undefined,
    phone: project.client.phone ?? undefined,
    email: project.client.email ?? undefined,
  };

  const exportMeta: ExportMeta = {
    proposalId,
    date: dateLong,
    objectName: project.objectName,
    clientName: client.name,
    clientInn: client.inn,
    companyName: company.name,
  };

  return (
    <>
      <ProposalActions
        projectId={project.id}
        proposalId={proposalId}
        clientName={client.name}
        data={data}
        exportMeta={exportMeta}
        norms={norms}
      />
      <Proposal
        proposalId={proposalId}
        date={dateLong}
        objectName={project.objectName}
        company={company}
        client={client}
        data={data}
        norms={norms}
      />
    </>
  );
}
