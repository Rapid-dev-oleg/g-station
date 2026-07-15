/**
 * Спека инструкций типа — константы и типы (без db, client-safe).
 * Разделены от 'use server' actions: из тех можно экспортировать только
 * async-функции, а SECTIONS/типы нужны и клиенту (редактор), и серверу.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Разделы инструкции = разделы контракта модуля типа. */
export const SECTIONS = [
  { key: 'calc', label: 'Нормативный расчёт', hint: 'Шаг 2: как считать по нормам' },
  { key: 'selection', label: 'Особенности подбора', hint: 'Номенклатура, серии, материалы' },
  { key: 'format', label: 'Оформление', hint: 'Шаг 5: особенности вывода/ТКП' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as string[];

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
