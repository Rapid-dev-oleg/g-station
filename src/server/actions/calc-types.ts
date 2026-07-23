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
import { runKimiAgent } from '@/server/ai/kimi-agent';
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

// ─── Редактор полей схемы (B2): черновик → публикация версии ────────────────

const DATA_TYPES = new Set(['measured', 'number', 'enum', 'boolean', 'text', 'textarea', 'group', 'array']);

/** Валидация field-spec: непустые key/label, уникальные ключи на уровне,
 *  корректный dataType, enum имеет options, group/array — вложенные fields. */
function validateFields(fields: FieldSpec[], path = 'поля'): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return `${path}: добавьте хотя бы одно поле`;
  const seen = new Set<string>();
  for (const f of fields) {
    const key = (f.key ?? '').trim();
    if (!key) return `${path}: у поля пустой ключ`;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return `${path}: ключ «${key}» — латиница/цифры/подчёркивание, не с цифры`;
    if (seen.has(key)) return `${path}: дублируется ключ «${key}»`;
    seen.add(key);
    if (!(f.label ?? '').trim()) return `${path}: у поля «${key}» пустая подпись`;
    if (!DATA_TYPES.has(f.dataType)) return `${path}: у поля «${key}» неизвестный тип «${f.dataType}»`;
    if (f.dataType === 'enum' && (!f.options || f.options.length === 0)) return `${path}: enum-поле «${key}» без вариантов`;
    if ((f.dataType === 'group' || f.dataType === 'array')) {
      const nested = validateFields(f.fields ?? [], `${path} › ${key}`);
      if (nested) return nested;
    }
  }
  return null;
}

const revalidateSchema = (code: string) => {
  revalidatePath('/admin/types');
  revalidatePath(`/admin/types/${code}/schema`);
};

export async function getSchemaDraft(code: string): Promise<{
  code: string;
  name: string;
  activeVersion: number | null;
  hasDraft: boolean;
  working: FieldSpec[];
}> {
  await requireSuperAdmin();
  const t = await db.systemType.findUnique({ where: { code }, include: { schemas: true } });
  if (!t) throw new Error('Тип не найден');
  const active = t.schemas.find((s) => s.status === 'active') ?? null;
  const draft = t.schemas.find((s) => s.status === 'draft') ?? null;
  return {
    code: t.code,
    name: t.name,
    activeVersion: active?.version ?? null,
    hasDraft: !!draft,
    working: ((draft ?? active)?.fields as unknown as FieldSpec[]) ?? [],
  };
}

/** Сохранить черновик схемы (создаёт draft-версию или обновляет существующую). */
export async function saveDraftSchema(code: string, fields: FieldSpec[], note?: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const err = validateFields(fields);
  if (err) return { ok: false, error: err };
  const t = await db.systemType.findUnique({ where: { code }, include: { schemas: true } });
  if (!t) return { ok: false, error: 'Тип не найден' };
  const draft = t.schemas.find((s) => s.status === 'draft');
  if (draft) {
    await db.typeSchema.update({ where: { id: draft.id }, data: { fields: fields as object, note: note ?? null } });
  } else {
    const maxV = t.schemas.reduce((m, s) => Math.max(m, s.version), 0);
    await db.typeSchema.create({ data: { typeCode: code, version: maxV + 1, fields: fields as object, status: 'draft', note: note ?? null } });
  }
  revalidateSchema(code);
  return { ok: true };
}

/** Опубликовать черновик: текущая active → archived, draft → active. */
export async function publishSchema(code: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const t = await db.systemType.findUnique({ where: { code }, include: { schemas: true } });
  if (!t) return { ok: false, error: 'Тип не найден' };
  const draft = t.schemas.find((s) => s.status === 'draft');
  if (!draft) return { ok: false, error: 'Нет черновика для публикации' };
  const err = validateFields(draft.fields as unknown as FieldSpec[]);
  if (err) return { ok: false, error: err };
  await db.$transaction([
    db.typeSchema.updateMany({ where: { typeCode: code, status: 'active' }, data: { status: 'archived' } }),
    db.typeSchema.update({ where: { id: draft.id }, data: { status: 'active' } }),
  ]);
  revalidateSchema(code);
  return { ok: true };
}

/** Удалить черновик (вернуться к активной версии). */
export async function discardDraft(code: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.typeSchema.deleteMany({ where: { typeCode: code, status: 'draft' } });
  revalidateSchema(code);
  return { ok: true };
}

// ─── ИИ-помощник схемы: инженер описывает словами → ИИ предлагает поля ───────

/** Достать JSON-массив полей из ответа агента (маркеры / ```json / первый […]). */
function extractFieldsJson(out: string): FieldSpec[] | null {
  const marked = out.match(/<<<RESULT>>>\n?([\s\S]*?)\n?<<<END_RESULT>>>/);
  let raw = (marked ? marked[1] : out).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  if (raw[0] !== '[') {
    const arr = raw.match(/\[[\s\S]*\]/);
    if (arr) raw = arr[0];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FieldSpec[]) : null;
  } catch {
    return null;
  }
}

/**
 * ИИ-помощник конструктора схемы. Инженер описывает словами, какие поля нужны
 * (или как изменить текущие), ИИ возвращает ПОЛНЫЙ новый список полей (FieldSpec[]).
 * Ничего не сохраняет — редактор показывает результат как несохранённый черновик,
 * инженер проверяет и сам жмёт «Сохранить черновик»/«Опубликовать». Тот же
 * рабочий CLI-агент, что и правка методики (proposeSkillEdit).
 */
export async function proposeSchemaFields(
  code: string,
  instruction: string,
  currentFields: FieldSpec[],
): Promise<{ ok: true; fields: FieldSpec[] } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if (!instruction.trim()) return { ok: false, error: 'Опишите, какие поля нужны' };
  const t = await db.systemType.findUnique({ where: { code } });
  if (!t) return { ok: false, error: 'Тип не найден' };

  const prompt =
    'Ты — конструктор ОПРОСНОГО ЛИСТА (схемы полей ввода) для типа расчёта насосной ' +
    'станции. Тебе дают ИНСТРУКЦИЮ инженера и ТЕКУЩИЙ список полей (JSON). Верни ПОЛНЫЙ ' +
    'изменённый список полей — массив JSON — между строками-маркерами <<<RESULT>>> и ' +
    '<<<END_RESULT>>> (каждый маркер на своей строке). Меняй только то, что просит ' +
    'инструкция; остальные поля сохрани как есть (тот же порядок и ключи). Никаких ' +
    'пояснений вне маркеров.\n\n' +
    'СХЕМА одного поля (FieldSpec):\n' +
    '- key: строка, латиница/цифры/подчёркивание, не начинается с цифры, уникальна на уровне (стабильный идентификатор в данных).\n' +
    '- label: подпись на русском для формы.\n' +
    '- dataType: одно из "measured" (число+единица, для Q/H/мощности), "number", ' +
    '"enum" (выбор), "boolean" (да/нет), "text", "textarea", "group" (вложенный объект), "array" (повторяемый подсписок).\n' +
    '- unit: единица для measured ("м³/ч", "м", "кВт", "л/с").\n' +
    '- options: для enum — массив {"value":"код-латиницей","label":"подпись"}.\n' +
    '- required: true если поле обязательное.\n' +
    '- hint: короткая подсказка под полем (необязательно).\n' +
    '- provenance: true для measured, если важен источник значения (из ТЗ/допущение).\n' +
    '- visibleIf: {"field":"ключ-другого-поля","equals":[значение]} — показывать поле только при условии (необязательно).\n' +
    '- fields: для group/array — вложенный массив полей по той же схеме.\n\n' +
    `ИНСТРУКЦИЯ ИНЖЕНЕРА:\n${instruction.trim()}\n\n` +
    `=== ТЕКУЩИЙ СПИСОК ПОЛЕЙ (${currentFields.length}) ===\n` +
    `${JSON.stringify(currentFields, null, 2)}\n=== КОНЕЦ ===`;

  let output: string;
  try {
    ({ output } = await runKimiAgent({ prompt, timeoutMs: 3 * 60 * 1000 }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка ИИ' };
  }

  const fields = extractFieldsJson(output);
  if (!fields) return { ok: false, error: 'ИИ вернул результат не в формате списка полей — уточните запрос' };
  const err = validateFields(fields);
  if (err) return { ok: false, error: `ИИ предложил некорректные поля (${err}) — уточните запрос` };
  return { ok: true, fields };
}
