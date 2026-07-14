import { listNorms } from '@/server/actions/norms';
import { NormsManager } from '@/components/admin/NormsManager';

export const dynamic = 'force-dynamic';

/** Библиотека норм (СП/ГОСТ). Доступ — супер-админ (layout /admin). */
export default async function NormsPage() {
  const norms = await listNorms();
  return <NormsManager norms={norms} />;
}
