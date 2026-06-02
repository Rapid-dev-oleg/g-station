/**
 * Конфигурация Kimi: ключ, endpoint, бинарь CLI и директории скилов/workspace.
 * Ключ берётся из настроек приложения (Settings.kimiKey), затем из окружения.
 */

import { db } from '@/server/db';

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1';

export interface KimiConfig {
  /** API-ключ Kimi (sk-kimi-...). */
  apiKey: string;
  /** Базовый URL endpoint. */
  baseUrl: string;
  /** Путь к бинарю kimi CLI. */
  binPath: string;
  /** Рабочая директория агента (содержит .claude/skills + данные). */
  workspace: string;
  /** Доп. директории со скилами для extra_skills_dirs. */
  skillsDirs: string[];
}

/**
 * Собирает конфиг Kimi. Приоритет ключа: Settings.kimiKey → MOONSHOT_API_KEY.
 * Workspace и пути скилов — из окружения (для Docker задаются через env).
 */
export async function getKimiConfig(): Promise<KimiConfig> {
  let kimiKey: string | null = null;
  try {
    const s = await db.settings.findUnique({ where: { id: 'singleton' } });
    // Поле kimiKey может отсутствовать до миграции — читаем мягко.
    kimiKey = (s as { kimiKey?: string | null } | null)?.kimiKey ?? null;
  } catch {
    // БД недоступна — упадём на env.
  }

  return {
    apiKey: kimiKey || process.env.MOONSHOT_API_KEY || '',
    baseUrl: process.env.KIMI_BASE_URL || DEFAULT_BASE_URL,
    binPath: process.env.KIMI_BIN || 'kimi',
    workspace: process.env.KIMI_AGENT_WORKSPACE || process.cwd(),
    skillsDirs: (process.env.KIMI_EXTRA_SKILLS_DIRS || '')
      .split(':')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Выбранный бэкенд агента-расчётчика: 'claude' | 'kimi'.
 * Приоритет: Settings.calcAgent (правится в /settings) → env CALC_AGENT → 'kimi'.
 */
export async function getCalcAgent(): Promise<'kimi' | 'claude'> {
  let fromDb: string | null = null;
  try {
    const s = await db.settings.findUnique({ where: { id: 'singleton' } });
    fromDb = (s as { calcAgent?: string | null } | null)?.calcAgent ?? null;
  } catch {
    // БД недоступна — упадём на env.
  }
  const v = (fromDb || process.env.CALC_AGENT || 'kimi').toLowerCase();
  return v === 'claude' ? 'claude' : 'kimi';
}

/**
 * Нейтральное сообщение об ошибке агента для показа пользователю — БЕЗ упоминания
 * конкретного движка/модели. Сырые детали (403, stderr) пишутся только в лог.
 */
export function genericAgentError(detail: string): string {
  const d = detail.toLowerCase();
  if (/403|usage limit|quota|access_terminated|rate.?limit|429/.test(d)) {
    return 'Превышен лимит запросов к сервису расчёта. Попробуйте позже или смените движок расчёта в Настройках.';
  }
  if (/таймаут|timeout|killed|убит/.test(d)) {
    return 'Расчёт занял слишком долго и был прерван. Попробуйте ещё раз.';
  }
  return 'Не удалось выполнить расчёт. Попробуйте ещё раз.';
}
