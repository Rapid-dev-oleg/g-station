import { getInstructions } from '@/server/actions/instructions';
import { InstructionEditor } from '@/components/admin/InstructionEditor';

export const dynamic = 'force-dynamic';

/** Редактор инструкций расчёта типа (адресуемые куски). Доступ — супер-админ. */
export default async function InstructionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getInstructions(code);
  return <InstructionEditor {...data} />;
}
