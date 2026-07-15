/**
 * Сборка инструкций типа в резолвленный markdown — БЕЗ auth-гейта, чтобы
 * пайплайн расчёта (engineer-контекст) мог собрать инструкцию нового типа в
 * промпт агента. Auth-обёртки — в actions/instructions.ts (супер-админ).
 */
import { db } from '@/server/db';
import { resolveText, extractRefs, type NormLite } from '@/lib/schema/resolve';
import type { FieldSpec } from '@/lib/schema/types';
import { SECTIONS, BASE_TYPE, type InstructionItemRow } from './spec';

/** Карта норм (код → NormLite) для резолва токенов. */
export async function buildNormMap(): Promise<Map<string, NormLite>> {
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
export async function paramList(typeCode: string): Promise<{ key: string; label: string }[]> {
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

/** Active-пункты типа, сгруппированные по шагу (section → пункты по order). */
async function activeItemsBySection(typeCode: string): Promise<Map<string, { title: string; body: string }[]>> {
  const instrs = await db.instruction.findMany({
    where: { typeCode, status: 'active' },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  const m = new Map<string, { title: string; body: string }[]>();
  for (const instr of instrs) {
    const arr = m.get(instr.section) ?? [];
    for (const it of instr.items) arr.push({ title: it.title, body: it.body });
    m.set(instr.section, arr);
  }
  return m;
}

/**
 * Собирает методику типа в один markdown: по каждому из 5 шагов —
 * сперва пункты БАЗЫ (ядро, общее), затем ОВЕРЛЕЯ типа (специфика), с
 * развёрнутыми токенами норм/параметров. Для типа 'base' — только ядро.
 * Пусто, если ни базы, ни оверлея нет.
 */
export async function compileInstructions(typeCode: string): Promise<string> {
  const base = await activeItemsBySection(BASE_TYPE);
  const overlay = typeCode === BASE_TYPE ? new Map<string, { title: string; body: string }[]>() : await activeItemsBySection(typeCode);
  if (base.size === 0 && overlay.size === 0) return '';

  const normMap = await buildNormMap();
  const paramLabels = new Map((await paramList(typeCode)).map((p) => [p.key, p.label]));

  const parts: string[] = [];
  for (const s of SECTIONS) {
    const items = [...(base.get(s.key) ?? []), ...(overlay.get(s.key) ?? [])];
    if (items.length === 0) continue;
    parts.push(`## ${s.label}`);
    for (const it of items) {
      parts.push(`### ${it.title}`);
      parts.push(resolveText(it.body, normMap, paramLabels));
    }
  }
  return parts.join('\n\n').trim();
}

/**
 * Какие нормы (коды) реально использует тип — из токенов {{norm:код#…}} во всех
 * его инструкциях. Для таба «Нормативы» и обзора. Возвращает код → сколько
 * пунктов ссылается.
 */
export async function typeNormUsage(typeCode: string): Promise<{ code: string; refs: number }[]> {
  const codes = typeCode === BASE_TYPE ? [BASE_TYPE] : [BASE_TYPE, typeCode];
  const items = await db.instructionItem.findMany({
    where: { instruction: { typeCode: { in: codes } } },
    select: { body: true },
  });
  const counts = new Map<string, number>();
  for (const it of items) {
    const codes = new Set(extractRefs(it.body).norms.map((n) => n.code));
    for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].map(([code, refs]) => ({ code, refs })).sort((a, b) => a.code.localeCompare(b.code));
}

/** Число пунктов инструкций у типа (для сводки). */
export async function instructionItemCount(typeCode: string): Promise<number> {
  return db.instructionItem.count({ where: { instruction: { typeCode } } });
}

/**
 * Куски, относящиеся к параметру (для адресной правки через ИИ): по paramKey
 * или по токену {{param:ключ}} в body.
 */
export async function findItemsByParam(typeCode: string, paramKey: string): Promise<InstructionItemRow[]> {
  const key = paramKey.trim();
  const items = await db.instructionItem.findMany({
    where: { instruction: { typeCode } },
    orderBy: { order: 'asc' },
  });
  return items
    .filter((i) => i.paramKey === key || extractRefs(i.body).params.includes(key))
    .map((i) => ({ id: i.id, paramKey: i.paramKey, title: i.title, body: i.body, order: i.order }));
}
