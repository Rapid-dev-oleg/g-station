import { notFound } from 'next/navigation';
import { getCardDesign } from '@/server/actions/card-design';
import { CardDesigner } from '@/components/admin/CardDesigner';

export const dynamic = 'force-dynamic';

/** Дизайн карточки результата типа (конфиг блоков + ИИ-помощник). Супер-админ. */
export default async function CardDesignPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getCardDesign(code);
  if (!data) notFound();
  return <CardDesigner code={data.code} initial={data.layout} customized={data.customized} />;
}
