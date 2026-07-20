import { redirect } from 'next/navigation';

/** Открыли тип → сразу вкладка «Схема». */
export default async function TypeIndexPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/admin/types/${code}/schema`);
}
