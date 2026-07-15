/**
 * Сборка инструкций типа в резолвленный markdown — БЕЗ auth-гейта, чтобы
 * пайплайн расчёта (engineer-контекст) мог собрать инструкцию нового типа в
 * промпт агента. Auth-обёртки — в actions/instructions.ts (супер-админ).
 */
import { db } from '@/server/db';
import { resolveText, extractRefs, type NormLite } from '@/lib/schema/resolve';
import type { FieldSpec } from '@/lib/schema/types';
import { SECTIONS, SECTION_KEYS, type InstructionItemRow } from './spec';

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

/**
 * Собирает active-разделы инструкций типа, разворачивает токены норм/параметров
 * → один markdown. Пустая строка, если инструкций нет (fire — не использует).
 */
export async function compileInstructions(typeCode: string): Promise<string> {
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
