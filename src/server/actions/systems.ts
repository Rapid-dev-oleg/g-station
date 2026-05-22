'use server';

/**
 * Server actions для систем — мутации.
 *
 * Система = одна насосная станция. Расчётное дело (`Dossier`) хранится
 * целиком JSONB-полем System.dossier и валидируется JSON Schema (ajv).
 */

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createEmptyDossier } from '@/lib/dossier/factory';
import type { Dossier, Meta, StationInput } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { db } from '@/server/db';

/** Поля для создания системы. */
export interface CreateSystemInput {
  name: string;
  projectId: string;
  /** Код типа системы из справочника SystemType ('fire' и т.п.). */
  typeCode?: string;
  engineerId?: string;
}

/** Создаёт систему с пустым расчётным делом. */
export async function createSystem(input: CreateSystemInput) {
  const dossier = createEmptyDossier(input.name);
  const system = await db.system.create({
    data: {
      name: input.name,
      projectId: input.projectId,
      typeCode: input.typeCode ?? 'fire',
      engineerId: input.engineerId,
      dossier: dossier as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/projects/${input.projectId}`);
  return { id: system.id };
}

/**
 * Правит входные данные системы — `dossier.meta` + `stations[0].input`.
 * Перед записью дело валидируется по JSON Schema.
 */
export async function updateSystemInput(
  systemId: string,
  patch: { meta?: Partial<Meta>; input?: Partial<StationInput> },
) {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) {
    return { ok: false as const, errors: ['Система не найдена'] };
  }

  const dossier = system.dossier as unknown as Dossier;
  if (!dossier.stations || dossier.stations.length === 0) {
    return { ok: false as const, errors: ['В деле нет станции'] };
  }

  const next: Dossier = {
    ...dossier,
    meta: { ...dossier.meta, ...patch.meta },
    stations: dossier.stations.map((st, i) =>
      i === 0 ? { ...st, input: { ...st.input, ...patch.input } } : st,
    ),
  };

  const check = validateDossier(next);
  if (!check.valid) {
    return { ok: false as const, errors: check.errors };
  }

  await db.system.update({
    where: { id: systemId },
    data: { dossier: next as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/systems/${systemId}`);
  revalidatePath(`/projects/${system.projectId}`);
  return { ok: true as const };
}

/** Переименовывает систему. */
export async function renameSystem(systemId: string, name: string) {
  const system = await db.system.update({
    where: { id: systemId },
    data: { name },
  });
  revalidatePath(`/systems/${systemId}`);
  revalidatePath(`/projects/${system.projectId}`);
  return { id: systemId };
}

/** Удаляет систему. */
export async function deleteSystem(systemId: string) {
  const system = await db.system.delete({ where: { id: systemId } });
  revalidatePath(`/projects/${system.projectId}`);
  return { id: systemId };
}
