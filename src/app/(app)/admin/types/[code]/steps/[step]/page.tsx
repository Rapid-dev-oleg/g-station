import { getCalcType } from '@/server/actions/calc-types';
import { readSkillFile, listSkillFileVersions } from '@/server/actions/skills';
import { listTypeSteps } from '@/server/actions/type-steps';
import { StepSkillEditor } from '@/components/admin/StepSkillEditor';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Один шаг = редактирование его скила (файл методики) + ИИ-помощник + версии. */
export default async function StepPage({ params }: { params: Promise<{ code: string; step: string }> }) {
  const { code, step } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  const skillName = data.identity.skillName ?? 'pump-station-calc';

  const steps = await listTypeSteps(code);
  const def = steps.find((s) => s.key === step);
  if (!def || !def.file) notFound();
  const path = `.claude/skills/${skillName}/${def.file}`;

  let content = '';
  let missing = false;
  try {
    content = (await readSkillFile(path)).content;
  } catch {
    missing = true;
  }
  const versions = await listSkillFileVersions(path);

  return (
    <StepSkillEditor code={code} title={def.label} path={path} initialContent={content} missing={missing} versions={versions} />
  );
}
