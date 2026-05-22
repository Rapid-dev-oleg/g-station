/**
 * Чтение проектов для Server Components (без 'use server').
 */

import { db } from '@/server/db';

/** Все проекты с клиентом и числом систем, свежие сверху. */
export function getProjects() {
  return db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      client: true,
      _count: { select: { systems: true } },
    },
  });
}

/** Проект по id с клиентом и системами. Возвращает null, если не найден. */
export function getProjectById(id: string) {
  return db.project.findUnique({
    where: { id },
    include: {
      client: true,
      systems: {
        orderBy: { createdAt: 'asc' },
        include: { type: true },
      },
    },
  });
}
