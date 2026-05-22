/**
 * Чтение систем для Server Components (без 'use server').
 *
 * System.dossier хранится JSONB-полем — при чтении приводится к `Dossier`.
 */

import type { Dossier } from '@/lib/dossier/types';
import { db } from '@/server/db';

/** Система (= одна станция) с типизированным расчётным делом. */
export async function getSystem(id: string) {
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
