'use server';

/**
 * Инструкции расчёта типа — только супер-админ. Средняя гранулярность
 * (решение 14.07.2026): инструкция раздела = набор адресуемых кусков
 * (InstructionItem) с токенами {{norm:код#якорь}} / {{param:ключ}}.
 *
 * Расчёт нового типа: собрать active-куски по order → резолвер разворачивает
 * токены (см. compileInstructions) → один markdown → в промпт агента. Правка
 * ИИ — точечно по paramKey (см. findItemsByParam). Fire не трогаем.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';
import { resolveText, type NormLite } from '@/lib/schema/resolve';
import { extractRefs } from '@/lib/schema/resolve';
import type { FieldSpec } from '@/lib/schema/types';

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Разделы инструкции = разделы контракта модуля типа. */
export const SECTIONS = [
  { key: 'calc', label: 'Нормативный расчёт', hint: 'Шаг 2: как считать по нормам' },
  { key: 'selection', label: 'Особенности подбора', hint: 'Номенклатура, серии, материалы' },
  { key: 'format', label: 'Оформление', hint: 'Шаг 5: особенности вывода/ТКП' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];
const SECTION_KEYS = SECTIONS.map((s) => s.key) as string[];

export interface InstructionItemRow {
  id: string;
  paramKey: string | null;
  title: string;
  body: string;
  order: number;
}
export interface InstructionSection {
  id: string;
  section: string;
  version: number;
  status: string;
  items: InstructionItemRow[];
}

const done = (code: string): ActionResult => {
  revalidatePath(`/admin/types/${code}/instructions`);
  return { ok: true };
};

/** Инструкции типа, сгруппированные по разделам (draft-редактор). */
export async function getInstructions(typeCode: string): Promise<{
  typeCode: string;
  typeName: string;
  sections: InstructionSection[];
  params: { key: string; label: string }[];
  norms: { code: string; title: string; anchors: { key: string; label: string }[] }[];
}> {
  await requireSuperAdmin();
  const type = await db.systemType.findUnique({ where: { code: typeCode } });
  if (!type) throw new Error(`Тип «${typeCode}» не найден`);

  const rows = await db.instruction.findMany({
    where: { typeCode },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: [{ section: 'asc' }, { version: 'desc' }],
  });
  // редактируем последнюю версию каждого раздела
  const bySection = new Map<string, InstructionSection>();
  for (const r of rows) {
    if (bySection.has(r.section)) continue;
    bySection.set(r.section, {
      id: r.id, section: r.section, version: r.version, status: r.status,
      items: r.items.map((i) => ({ id: i.id, paramKey: i.paramKey, title: i.title, body: i.body, order: i.order })),
    });
  }
  const sections = SECTION_KEYS.map((s) => bySection.get(s) ?? null).filter(Boolean) as InstructionSection[];

  const params = await paramList(typeCode);
  const norms = (await db.norm.findMany({ where: { status: 'active' }, orderBy: { code: 'asc' } })).map((n) => ({
    code: n.code, title: n.title, anchors: anchorsOf(n.content),
  }));
  return { typeCode, typeName: type.name, sections, params, norms };
}

/** Создаёт (или возвращает) черновик инструкции раздела. */
export async function ensureSection(typeCode: string, section: string): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!SECTION_KEYS.includes(section)) return { ok: false, error: 'Неизвестный раздел' };
  const exists = await db.instruction.findFirst({ where: { typeCode, section } });
  if (!exists) await db.instruction.create({ data: { typeCode, section } });
  return done(typeCode);
}

export async function addItem(instructionId: string, typeCode: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const max = await db.instructionItem.aggregate({ where: { instructionId }, _max: { order: true } });
  await db.instructionItem.create({
    data: { instructionId, title: 'Новый пункт', body: '', order: (max._max.order ?? -1) + 1 },
  });
  return done(typeCode);
}

export async function updateItem(
  itemId: string, typeCode: string,
  input: { paramKey?: string; title: string; body: string },
): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!input.title?.trim()) return { ok: false, error: 'Заголовок пункта не может быть пустым' };
  await db.instructionItem.update({
    where: { id: itemId },
    data: { paramKey: input.paramKey?.trim() || null, title: input.title.trim(), body: input.body ?? '' },
  });
  return done(typeCode);
}

export async function deleteItem(itemId: string, typeCode: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.instructionItem.delete({ where: { id: itemId } });
  return done(typeCode);
}

/** Перестановка пункта вверх/вниз (обмен order с соседом). */
export async function moveItem(itemId: string, typeCode: string, dir: 'up' | 'down'): Promise<ActionResult> {
  await requireSuperAdmin();
  const item = await db.instructionItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: 'Пункт не найден' };
  const neighbor = await db.instructionItem.findFirst({
    where: {
      instructionId: item.instructionId,
      order: dir === 'up' ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: dir === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return { ok: true };
  await db.$transaction([
    db.instructionItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
    db.instructionItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
  ]);
  return done(typeCode);
}

/** Публикация раздела: draft → active, прежняя active → superseded, +версия. */
export async function publishSection(instructionId: string, typeCode: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const instr = await db.instruction.findUnique({ where: { id: instructionId } });
  if (!instr) return { ok: false, error: 'Инструкция не найдена' };
  await db.$transaction([
    db.instruction.updateMany({
      where: { typeCode, section: instr.section, status: 'active', id: { not: instructionId } },
      data: { status: 'superseded' },
    }),
    db.instruction.update({ where: { id: instructionId }, data: { status: 'active' } }),
  ]);
  return done(typeCode);
}

/**
 * Сборка инструкций типа в один резолвленный markdown (для промпта агента).
 * Берёт active-разделы, разворачивает токены норм/параметров. Fire не
 * использует — его расчёт остаётся markdown-скилом.
 */
export async function compileInstructions(typeCode: string): Promise<string> {
  await requireSuperAdmin();
  const instrs = await db.instruction.findMany({
    where: { typeCode, status: 'active' },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (instrs.length === 0) return '';

  const normMap = await buildNormMap();
  const paramLabels = new Map((await paramList(typeCode)).map((p) => [p.key, p.label]));

  const order = new Map(SECTION_KEYS.map((s, i) => [s, i]));
  instrs.sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));

  const parts: string[] = [];
  for (const instr of instrs) {
    const label = SECTIONS.find((s) => s.key === instr.section)?.label ?? instr.section;
    parts.push(`## ${label}`);
    for (const item of instr.items) {
      parts.push(`### ${item.title}`);
      parts.push(resolveText(item.body, normMap, paramLabels));
    }
  }
  return parts.join('\n\n').trim();
}

/**
 * Поиск кусков, относящихся к параметру (для адресной правки через ИИ):
 * по paramKey или по токену {{param:ключ}} в body.
 */
export async function findItemsByParam(typeCode: string, paramKey: string): Promise<InstructionItemRow[]> {
  await requireSuperAdmin();
  const key = paramKey.trim();
  const items = await db.instructionItem.findMany({
    where: { instruction: { typeCode } },
    orderBy: { order: 'asc' },
  });
  return items
    .filter((i) => i.paramKey === key || extractRefs(i.body).params.includes(key))
    .map((i) => ({ id: i.id, paramKey: i.paramKey, title: i.title, body: i.body, order: i.order }));
}

// ── helpers ─────────────────────────────────────────────────────────────
function anchorsOf(content: unknown): { key: string; label: string }[] {
  if (!content || typeof content !== 'object') return [];
  return Object.entries(content as Record<string, { label?: string }>).map(([key, v]) => ({ key, label: v?.label ?? key }));
}

async function buildNormMap(): Promise<Map<string, NormLite>> {
  const rows = await db.norm.findMany();
  const map = new Map<string, NormLite>();
  for (const n of rows) {
    map.set(n.code, {
      code: n.code, version: n.version, title: n.title,
      content: (n.content as NormLite['content']) ?? null,
    });
  }
  return map;
}

/** Плоский список параметров типа из активной схемы (ключ + подпись). */
async function paramList(typeCode: string): Promise<{ key: string; label: string }[]> {
  const schema = await db.typeSchema.findFirst({ where: { typeCode, status: 'active' }, orderBy: { version: 'desc' } });
  const out: { key: string; label: string }[] = [];
  const walk = (fields: FieldSpec[]) => {
    for (const f of fields) {
      if (f.key) out.push({ key: f.key, label: f.label ?? f.key });
      if (Array.isArray(f.fields)) walk(f.fields as FieldSpec[]);
    }
  };
  if (schema?.fields) walk(schema.fields as unknown as FieldSpec[]);
  return out;
}
