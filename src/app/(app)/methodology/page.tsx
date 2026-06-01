import { PageHeader } from '@/components/layout/PageHeader';
import { MethodologyEditor } from '@/components/methodology/MethodologyEditor';
import { listSkillFiles } from '@/server/actions/skills';

export const dynamic = 'force-dynamic';

export default async function MethodologyPage() {
  const files = await listSkillFiles();
  return (
    <div>
      <PageHeader
        title="Методика"
        subtitle="Скилы и база знаний расчёта — правки сразу влияют на агента"
      />
      <MethodologyEditor files={files} />
    </div>
  );
}
