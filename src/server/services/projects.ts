/**
 * Чтение проектов для Server Components (без 'use server').
 */

import type { Dossier } from '@/lib/dossier/types';
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

/**
 * Проект для ТКП — клиент и все системы с типизированными расчётными
 * делами (dossier приводится из Prisma.JsonValue к Dossier).
 */
export async function getProjectForProposal(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: true,
      systems: {
        orderBy: { createdAt: 'asc' },
        include: { type: true },
      },
    },
  });
  if (!project) return null;
  return {
    ...project,
    systems: project.systems.map((s) => ({
      ...s,
      dossier: s.dossier as unknown as Dossier,
    })),
  };
}
