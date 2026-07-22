'use server';

/**
 * Шаги расчётного конвейера типа как ДАННЫЕ (TypeStep). Инженер добавляет/
 * удаляет/переставляет шаги в типе; пайплайн идёт по ним. Только супер-админ.
 */
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };
export type StepKind = 'input' | 'llm' | 'script' | 'doc';

export interface TypeStepRow {
  id: string;
  order: number;
  key: string;
  label: string;
  kind: string;
  directive: string | null;
  file: string | null;
  gate: boolean;
}

const done = (typeCode: string): ActionResult => {
  revalidatePath(`/admin/types/${typeCode}/steps`);
  return { ok: true };
};

export async function listTypeSteps(typeCode: string): Promise<TypeStepRow[]> {
  await requireSuperAdmin();
  const rows = await db.typeStep.findMany({ where: { typeCode }, orderBy: { order: 'asc' } });
  return rows.map((r) => ({ id: r.id, order: r.order, key: r.key, label: r.label, kind: r.kind, directive: r.directive, file: r.file, gate: r.gate }));
}

export async function addTypeStep(typeCode: string, input: { label: string; kind?: StepKind }): Promise<ActionResult> {
  await requireSuperAdmin();
  const label = input.label?.trim();
  if (!label) return { ok: false, error: 'Укажите название шага' };
  const max = await db.typeStep.aggregate({ where: { typeCode }, _max: { order: true } });
  const key = 'st_' + randomUUID().slice(0, 8);
  await db.typeStep.create({
    data: { typeCode, order: (max._max.order ?? -1) + 1, key, label, kind: input.kind ?? 'llm' },
  });
  return done(typeCode);
}

export async function updateTypeStep(
  id: string, typeCode: string,
  input: { label?: string; kind?: StepKind; directive?: string; gate?: boolean },
): Promise<ActionResult> {
  await requireSuperAdmin();
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) { if (!input.label.trim()) return { ok: false, error: 'Название не может быть пустым' }; data.label = input.label.trim(); }
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.directive !== undefined) data.directive = input.directive.trim() || null;
  if (input.gate !== undefined) data.gate = input.gate;
  await db.typeStep.update({ where: { id }, data });
  return done(typeCode);
}

export async function deleteTypeStep(id: string, typeCode: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const step = await db.typeStep.findUnique({ where: { id } });
  if (step?.kind === 'input') return { ok: false, error: 'Шаг «Вход» удалить нельзя — это заполнение карточки' };
  await db.typeStep.delete({ where: { id } });
  return done(typeCode);
}

export async function moveTypeStep(id: string, typeCode: string, dir: 'up' | 'down'): Promise<ActionResult> {
  await requireSuperAdmin();
  const step = await db.typeStep.findUnique({ where: { id } });
  if (!step) return { ok: false, error: 'Шаг не найден' };
  const neighbor = await db.typeStep.findFirst({
    where: { typeCode, order: dir === 'up' ? { lt: step.order } : { gt: step.order } },
    orderBy: { order: dir === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return { ok: true };
  await db.$transaction([
    db.typeStep.update({ where: { id: step.id }, data: { order: neighbor.order } }),
    db.typeStep.update({ where: { id: neighbor.id }, data: { order: step.order } }),
  ]);
  return done(typeCode);
}
