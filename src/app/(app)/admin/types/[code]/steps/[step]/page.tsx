import { getCalcType } from '@/server/actions/calc-types';
import { readSkillFile, listSkillFileVersions } from '@/server/actions/skills';
import { StepSkillEditor } from '@/components/admin/StepSkillEditor';
import { STEP_FILES, stepFilePath } from '@/lib/pipeline/step-files';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Один степ = редактирование его скила (файл методики) + ИИ-помощник. */
export default async function StepPage({ params }: { params: Promise<{ code: string; step: string }> }) {
  const { code, step } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  const skillName = data.identity.skillName ?? 'pump-station-calc';

  // step → путь файла скила
  let path: string;
  let title: string;
  if (step === 'module') {
    if (!data.identity.typeModule) notFound();
    path = `.claude/skills/${skillName}/${data.identity.typeModule}`;
    title = 'Модуль типа';
  } else {
    const def = STEP_FILES.find((s) => s.key === step);
    if (!def) notFound();
    path = stepFilePath(skillName, def.file);
    title = def.label;
  }

  // читаем содержимое (может отсутствовать — тогда пусто, создастся при сохранении)
  let content = '';
  let missing = false;
  try {
    content = (await readSkillFile(path)).content;
  } catch {
    missing = true;
  }
  const versions = await listSkillFileVersions(path);

  return (
    <StepSkillEditor code={code} title={title} path={path} initialContent={content} missing={missing} versions={versions} />
  );
}
