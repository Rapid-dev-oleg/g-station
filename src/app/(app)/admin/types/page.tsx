import { listCalcTypes } from '@/server/actions/calc-types';
import { TypesManager } from '@/components/admin/TypesManager';

export const dynamic = 'force-dynamic';

/** Конструктор схем — реестр типов расчёта. Доступ — супер-админ (layout /admin). */
export default async function CalcTypesPage() {
  const types = await listCalcTypes();
  return <TypesManager types={types} />;
}
