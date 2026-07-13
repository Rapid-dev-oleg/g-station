/**
 * Чтение проектов для Server Components (без 'use server').
 * Изолировано по активному воркспейсу.
 */

import type { Dossier } from '@/lib/dossier/types';
import { workspaceDb } from '@/server/workspace-db';

/** Все проекты воркспейса с клиентом и числом систем, свежие сверху. */
export async function getProjects() {
  const db = await workspaceDb();
  return db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      client: true,
      _count: { select: { systems: true } },
    },
  });
}

/** Проект по id (в своём воркспейсе) с клиентом и системами. null, если не найден. */
export async function getProjectById(id: string) {
  const db = await workspaceDb();
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
  const db = await workspaceDb();
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
