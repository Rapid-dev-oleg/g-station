import { getCalcType } from '@/server/actions/calc-types';
import { listTypeSteps } from '@/server/actions/type-steps';
import { StepsTab } from '@/components/admin/StepsTab';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Шаги типа = данные (TypeStep). Добавить/удалить/переставить + править скил шага. */
export default async function StepsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  const steps = await listTypeSteps(code);
  return <StepsTab code={code} skillName={data.identity.skillName ?? 'pump-station-calc'} steps={steps} />;
}
