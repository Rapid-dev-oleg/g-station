import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Устаревший экран расчёта (старый TS-движок). Расчёт перенесён в единый
 * степпер на странице системы (через Kimi). Старые ссылки/закладки —
 * редиректим на единый экран. Движок (CalcPanel/runSystemCalc) сохранён
 * в коде для регресс-теста `npm run verify`.
 */
export default async function SystemCalcRedirect({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  redirect(`/projects/${id}/systems/${sid}`);
}
