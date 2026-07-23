import { getSpecSchema } from '@/server/actions/calc-types';
import { SpecSchemaEditor } from '@/components/admin/SpecSchemaEditor';

export const dynamic = 'force-dynamic';

/** Редактор схемы спецификации типа (состав оборудования). Доступ — супер-админ. */
export default async function SpecSchemaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getSpecSchema(code);
  return <SpecSchemaEditor code={data.code} name={data.name} working={data.fields} />;
}
