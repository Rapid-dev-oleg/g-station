/**
 * Чтение клиентов для Server Components (без 'use server').
 */

import { db } from '@/server/db';

/** Все клиенты, отсортированные по краткому имени. */
export function getClients() {
  return db.client.findMany({
    orderBy: { shortName: 'asc' },
  });
}

/** Клиент по id с его проектами. Возвращает null, если не найден. */
export function getClientById(id: string) {
  return db.client.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
}
