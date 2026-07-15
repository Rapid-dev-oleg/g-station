import { getTypeNorms } from '@/server/actions/norms';
import { TypeNormsTab } from '@/components/admin/TypeNormsTab';

export const dynamic = 'force-dynamic';

/** Нормативы, используемые типом (из токенов инструкций). Супер-админ. */
export default async function TypeNormsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const norms = await getTypeNorms(code);
  return <TypeNormsTab norms={norms} />;
}
