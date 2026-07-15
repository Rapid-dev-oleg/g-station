'use server';

/**
 * Инструкции расчёта типа — только супер-админ (async-экшены редактора).
 * Средняя гранулярность (решение 14.07.2026): инструкция раздела = набор
 * адресуемых кусков (InstructionItem) с токенами {{norm:код#якорь}} /
 * {{param:ключ}}. Константы/типы — в ./instructions/spec, сборка (без auth,
 * для пайплайна расчёта) — в ./instructions/compile.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';
import { SECTION_KEYS, BASE_TYPE, type ActionResult, type InstructionSection } from '@/server/instructions/spec';
import { paramList } from '@/server/instructions/compile';

/** Базовые (ядро) пункты по шагам — read-only слой для оверлей-типов. */
export interface BaseStep { section: string; items: { title: string; body: string }[] }

const done = (code: string): ActionResult => {
  revalidatePath(`/admin/types/${code}/instructions`);
  return { ok: true };
};

function anchorsOf(content: unknown): { key: string; label: string }[] {
  if (!content || typeof content !== 'object') return [];
  return Object.entries(content as Record<string, { label?: string }>).map(([key, v]) => ({ key, label: v?.label ?? key }));
}

async function ownSections(typeCode: string): Promise<InstructionSection[]> {
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
  return SECTION_KEYS.map((s) => bySection.get(s) ?? null).filter(Boolean) as InstructionSection[];
}

/**
 * Инструкции типа для редактора: свои разделы (правимые) + слой БАЗЫ (ядро,
 * read-only) по шагам. Для самого типа 'base' слой базы пуст (он и есть база).
 */
export async function getInstructions(typeCode: string): Promise<{
  typeCode: string;
  typeName: string;
  isBase: boolean;
  sections: InstructionSection[];
  base: BaseStep[];
  params: { key: string; label: string }[];
  norms: { code: string; title: string; anchors: { key: string; label: string }[] }[];
}> {
  await requireSuperAdmin();
  const type = await db.systemType.findUnique({ where: { code: typeCode } });
  if (!type) throw new Error(`Тип «${typeCode}» не найден`);
  const isBase = typeCode === BASE_TYPE;

  const sections = await ownSections(typeCode);

  // слой базы (только active-пункты) — read-only, для оверлей-типов
  const base: BaseStep[] = [];
  if (!isBase) {
    const baseRows = await db.instruction.findMany({
      where: { typeCode: BASE_TYPE, status: 'active' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    const m = new Map<string, { title: string; body: string }[]>();
    for (const r of baseRows) {
      const arr = m.get(r.section) ?? [];
      for (const it of r.items) arr.push({ title: it.title, body: it.body });
      m.set(r.section, arr);
    }
    for (const s of SECTION_KEYS) {
      const items = m.get(s);
      if (items?.length) base.push({ section: s, items });
    }
  }

  const params = await paramList(typeCode);
  const norms = (await db.norm.findMany({ where: { status: 'active' }, orderBy: { code: 'asc' } })).map((n) => ({
    code: n.code, title: n.title, anchors: anchorsOf(n.content),
  }));
  return { typeCode, typeName: type.name, isBase, sections, base, params, norms };
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

/** Публикация раздела: draft → active, прежняя active → superseded. */
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
