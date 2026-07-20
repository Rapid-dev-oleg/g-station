import { getCalcType } from '@/server/actions/calc-types';
import { StepsTab } from '@/components/admin/StepsTab';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Степы типа = шаги конвейера (шаг-скилы). Открываем степ → правим скил. */
export default async function StepsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  return <StepsTab code={code} skillName={data.identity.skillName ?? 'pump-station-calc'} typeModule={data.identity.typeModule ?? null} />;
}
