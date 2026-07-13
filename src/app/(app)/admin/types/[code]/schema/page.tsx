import { getSchemaDraft } from '@/server/actions/calc-types';
import { SchemaEditor } from '@/components/admin/SchemaEditor';

export const dynamic = 'force-dynamic';

/** Редактор схемы ввода типа (конструктор полей). Доступ — супер-админ. */
export default async function SchemaEditPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getSchemaDraft(code);
  return <SchemaEditor {...data} />;
}
