/**
 * Спека инструкций типа — константы и типы (без db, client-safe).
 * Разделены от 'use server' actions: из тех можно экспортировать только
 * async-функции, а SECTIONS/типы нужны и клиенту (редактор), и серверу.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Код общего слоя «База» (ядро расчёта, 5 шагов) — общий для всех pump-типов.
 *  Хранится как SystemType 'base'; скрыт из интейка/подбора типа ТЗ. */
export const BASE_TYPE = 'base';

/** Разделы инструкции = 5 шагов конвейера методики (ядро + модуль типа). */
export const SECTIONS = [
  { key: 'input', label: '1 · Вход', hint: 'Карточка параметров из ТЗ, провенанс, гейт 1' },
  { key: 'calc', label: '2 · Расчёт', hint: 'Рабочая точка, нормативный расчёт, резервирование, DN, мощность, пуск' },
  { key: 'selection', label: '3 · Подбор', hint: 'Насос, жокей, коллектор, ШУ, корпус, доп.оборудование' },
  { key: 'pricing', label: '4 · Цена', hint: 'BOM, цены, курс/скидка (гейт 2), наценка' },
  { key: 'output', label: '5 · Выход', hint: 'Шифр, выбор варианта, валидация, гейт 3' },
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
