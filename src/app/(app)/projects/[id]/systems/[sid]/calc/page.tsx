import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Устаревший экран расчёта. Расчёт идёт в едином степпере на странице системы
 * (через Kimi-агента). Старые ссылки/закладки редиректим на единый экран.
 * Прежний TS-движок удалён — расчёт только через LLM.
 */
export default async function SystemCalcRedirect({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  redirect(`/projects/${id}/systems/${sid}`);
}
