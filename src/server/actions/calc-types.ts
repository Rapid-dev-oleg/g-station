'use server';

/**
 * Конструктор схем — управление ТИПАМИ расчёта (реестр SystemType + версии
 * схемы ввода TypeSchema). Типы общие для платформы → доступ супер-админу.
 * Редактор полей схемы (B2) — отдельными действиями; здесь идентичность типа
 * и чтение версий.
 */
import { revalidatePath } from 'next/cache';
import type { SystemTypeStatus } from '@prisma/client';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';
import type { FieldSpec } from '@/lib/schema/types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const ok = (): ActionResult => {
  revalidatePath('/admin/types');
  return { ok: true };
};

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}
function fieldCount(fields: unknown): number {
  return Array.isArray(fields) ? fields.length : 0;
}

// ─── Список типов ──────────────────────────────────────────────────────────

export interface CalcTypeRow {
  code: string;
  name: string;
  status: SystemTypeStatus;
  description: string | null;
  skillName: string | null;
  typeModule: string | null;
  triggers: string[];
  purposes: string[];
  components: string[];
  activeSchema: { version: number; fieldCount: number } | null;
  draftCount: number;
}

export async function listCalcTypes(): Promise<CalcTypeRow[]> {
  await requireSuperAdmin();
  const types = await db.systemType.findMany({
    orderBy: { name: 'asc' },
    include: { schemas: true },
  });
  return types.map((t) => {
    const active = t.schemas.find((s) => s.status === 'active') ?? null;
    return {
      code: t.code,
      name: t.name,
      status: t.status,
      description: t.description,
      skillName: t.skillName,
      typeModule: t.typeModule,
      triggers: toStrArray(t.triggers),
      purposes: toStrArray(t.purposes),
      components: toStrArray(t.components),
      activeSchema: active ? { version: active.version, fieldCount: fieldCount(active.fields) } : null,
      draftCount: t.schemas.filter((s) => s.status === 'draft').length,
    };
  });
}

// ─── Идентичность типа (раздел 1 контракта) ────────────────────────────────

export interface CalcTypeIdentity {
  name: string;
  status: SystemTypeStatus;
  description?: string;
  skillName?: string;
  typeModule?: string;
  triggers: string[];
  purposes: string[];
  components: string[];
}

/** Создаёт новый тип расчёта (code — латиницей, уникален; статус PLANNED). */
export async function createCalcType(input: { code: string; name: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  const code = input.code?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const name = input.name?.trim();
  if (!code) return { ok: false, error: 'Код типа — латиница/цифры (напр. water)' };
  if (!name) return { ok: false, error: 'Укажите название типа' };
  const exists = await db.systemType.findUnique({ where: { code } });
  if (exists) return { ok: false, error: `Тип «${code}» уже существует` };
  await db.systemType.create({
    data: { code, name, status: 'PLANNED', skillName: 'pump-station-calc' },
  });
  return ok();
}

/** Обновляет идентичность типа (раздел 1: имя, статус, триггеры и т.д.). */
export async function updateCalcTypeIdentity(code: string, input: CalcTypeIdentity): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!input.name?.trim()) return { ok: false, error: 'Название не может быть пустым' };
  await db.systemType.update({
    where: { code },
    data: {
      name: input.name.trim(),
      status: input.status,
      description: input.description?.trim() || null,
      skillName: input.skillName?.trim() || null,
      typeModule: input.typeModule?.trim() || null,
      triggers: input.triggers,
      purposes: input.purposes,
      components: input.components,
    },
  });
  return ok();
}

// ─── Версии схемы (чтение; редактор полей — B2) ────────────────────────────

export interface SchemaVersionRow {
  id: string;
  version: number;
  status: string;
  fieldCount: number;
  note: string | null;
  createdAt: string;
}

export async function getCalcType(code: string): Promise<{
  identity: CalcTypeIdentity & { code: string };
  schemas: SchemaVersionRow[];
  activeFields: FieldSpec[] | null;
} | null> {
  await requireSuperAdmin();
  const t = await db.systemType.findUnique({ where: { code }, include: { schemas: { orderBy: { version: 'desc' } } } });
  if (!t) return null;
  const active = t.schemas.find((s) => s.status === 'active') ?? null;
  return {
    identity: {
      code: t.code,
      name: t.name,
      status: t.status,
      description: t.description ?? undefined,
      skillName: t.skillName ?? undefined,
      typeModule: t.typeModule ?? undefined,
      triggers: toStrArray(t.triggers),
      purposes: toStrArray(t.purposes),
      components: toStrArray(t.components),
    },
    schemas: t.schemas.map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      fieldCount: fieldCount(s.fields),
      note: s.note,
      createdAt: s.createdAt.toISOString(),
    })),
    activeFields: (active?.fields as unknown as FieldSpec[]) ?? null,
  };
}
