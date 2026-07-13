/**
 * Чтение клиентов для Server Components (без 'use server').
 * Изолировано по активному воркспейсу.
 */

import { workspaceDb } from '@/server/workspace-db';

/** Все клиенты активного воркспейса, отсортированные по краткому имени. */
export async function getClients() {
  const db = await workspaceDb();
  return db.client.findMany({ orderBy: { shortName: 'asc' } });
}

/** Клиент по id (в своём воркспейсе) с его проектами. null, если не найден. */
export async function getClientById(id: string) {
  const db = await workspaceDb();
  return db.client.findUnique({
    where: { id },
    include: { projects: { orderBy: { updatedAt: 'desc' } } },
  });
}
