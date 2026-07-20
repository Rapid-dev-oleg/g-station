/**
 * Степы типа = шаги расчётного конвейера, каждый = файл скила (шаги/шагN.md).
 * Открываем степ → редактируем этот файл скила (текст + ИИ-помощник).
 * Client-safe: без server-импортов.
 */
export interface StepFile {
  key: string;
  label: string;
  hint: string;
  file: string; // относительно корня скила
}

export const STEP_FILES: StepFile[] = [
  { key: 'input', label: '1 · Вход', hint: 'Карточка из ТЗ, провенанс, гейт 1', file: 'шаги/шаг1-вход.md' },
  { key: 'calc', label: '2 · Расчёт', hint: 'Рабочая точка, резервирование, DN, мощность, пуск', file: 'шаги/шаг2-расчёт.md' },
  { key: 'selection', label: '3 · Подбор', hint: 'Насос, жокей, коллектор, ШУ, корпус', file: 'шаги/шаг3-подбор.md' },
  { key: 'pricing', label: '4 · Цена', hint: 'BOM, цены, курс/скидка (гейт 2), наценка', file: 'шаги/шаг4-ценообразование.md' },
  { key: 'output', label: '5 · Выход', hint: 'Шифр, выбор варианта, валидация, гейт 3', file: 'шаги/шаг5-выход.md' },
];

/** Полный путь файла степа в дереве методики (для чтения/записи скила). */
export function stepFilePath(skillName: string, file: string): string {
  return `.claude/skills/${skillName}/${file}`;
}
