'use server';

/**
 * Утверждение системы: фиксация расчёта Kimi в снапшот. Изолировано по воркспейсу.
 *
 * approvedSnapshot — замороженная копия расчёта на момент утверждения.
 * ТКП формируется из снапшота, поэтому последующий пересчёт черновика
 * (kimiCalc) не меняет уже утверждённые данные, пока инженер не утвердит заново.
 */

import { revalidatePath } from 'next/cache';
import { workspaceDb } from '@/server/workspace-db';

export interface ApproveResult {
  ok: boolean;
  error?: string;
}

/** Утверждает систему: kimiCalc → approvedSnapshot, статус FINALIZED. */
export async function approveSystem(systemId: string): Promise<ApproveResult> {
  const db = await workspaceDb();
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) return { ok: false, error: 'Система не найдена' };
  if (!system.kimiCalc) {
    return { ok: false, error: 'Нечего утверждать — сначала выполните расчёт' };
  }

  const snapshot = {
    ...(system.kimiCalc as Record<string, unknown>),
    approvedAt: new Date().toISOString(),
  };

  await db.system.updateMany({
    where: { id: systemId },
    data: { approvedSnapshot: snapshot, status: 'FINALIZED' },
  });

  revalidatePath(`/projects/${system.projectId}`);
  revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
  return { ok: true };
}

/** Снимает утверждение: возврат к CALCULATED (для пересчёта/правки). */
export async function unapproveSystem(systemId: string): Promise<ApproveResult> {
  const db = await workspaceDb();
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) return { ok: false, error: 'Система не найдена' };

  await db.system.updateMany({
    where: { id: systemId },
    data: { status: 'CALCULATED' },
  });

  revalidatePath(`/projects/${system.projectId}`);
  revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
  return { ok: true };
}
