/**
 * Чтение систем для Server Components (без 'use server').
 * Изолировано по активному воркспейсу.
 *
 * System.dossier хранится JSONB-полем — при чтении приводится к `Dossier`.
 */

import type { Dossier } from '@/lib/dossier/types';
import { workspaceDb } from '@/server/workspace-db';

/** Система (= одна станция) активного воркспейса с типизированным делом. */
export async function getSystem(id: string) {
  const db = await workspaceDb();
  const system = await db.system.findUnique({
    where: { id },
    include: {
      type: true,
      project: { include: { client: true } },
    },
  });
  if (!system) return null;
  // dossier — Prisma.JsonValue; модель валидируется ajv, приводим к Dossier.
  return { ...system, dossier: system.dossier as unknown as Dossier };
}
