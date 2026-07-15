import { getCalcType } from '@/server/actions/calc-types';
import { instructionItemCount, typeNormUsage } from '@/server/instructions/compile';
import { TypeOverview } from '@/components/admin/TypeOverview';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Обзор типа: идентичность + движок расчёта + сводка состава. Супер-админ. */
export default async function TypeOverviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  const [items, normUsage] = await Promise.all([instructionItemCount(code), typeNormUsage(code)]);
  const activeSchema = data.schemas.find((s) => s.status === 'active') ?? null;
  const hasDraft = data.schemas.some((s) => s.status === 'draft');

  return (
    <TypeOverview
      identity={data.identity}
      summary={{
        activeSchemaFields: activeSchema?.fieldCount ?? null,
        hasDraftSchema: hasDraft,
        instructionItems: items,
        normsUsed: normUsage.length,
      }}
    />
  );
}
