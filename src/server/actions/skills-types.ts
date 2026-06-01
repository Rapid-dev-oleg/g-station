/**
 * Типы редактора методики. Вынесены из `skills.ts`: файл с `'use server'`
 * может экспортировать ТОЛЬКО async-функции, не интерфейсы.
 */

export interface SkillFile {
  /** Путь относительно workspace (он же ключ для read/save). */
  path: string;
  /** Размер, байт. */
  size: number;
  /** Корень (скил/знания). */
  root: string;
}
