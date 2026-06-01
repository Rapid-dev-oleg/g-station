/**
 * Регистрация обработчиков фоновых задач. Импортируется из job-actions, чтобы
 * обработчики были зарегистрированы до постановки задач в очередь.
 */

import { registerJobHandler } from './runner';
import { calcSystemViaKimi } from '@/server/actions/kimi-calc';
import { runParseJob, type ParsedFileInfo } from '@/server/actions/parse';

let registered = false;

export function ensureJobHandlers(): void {
  if (registered) return;
  registered = true;

  // Парсинг ТЗ: агент читает файлы из временной папки сам (read_media/shell).
  // Результат — ParseResponse (redirect на созданный проект/систему или review).
  registerJobHandler('parse', async (input, ctx) => {
    const p = input as { dir: string; files: ParsedFileInfo[]; ownerId?: string; lockedProjectId?: string };
    const resp = await runParseJob({ ...p, progress: ctx.progress });
    // Для ссылки в /jobs вытащим projectId/systemId из redirect.
    let projectId: string | undefined;
    let systemId: string | undefined;
    if (resp.ok && resp.mode === 'redirect') {
      const m = resp.redirect.match(/\/projects\/([^/]+)(?:\/systems\/([^/]+))?/);
      if (m) {
        projectId = m[1];
        systemId = m[2];
      }
    }
    return { result: resp, projectId, systemId };
  });

  // Расчёт станции: тяжёлый Kimi-агент (~5–8 мин). Результат calcSystemViaKimi
  // сохраняет в System.kimiCalc сам — поэтому страница системы увидит его и
  // после ухода/возврата.
  registerJobHandler('calc', async (input, ctx) => {
    const { systemId } = input as { systemId: string };
    await ctx.progress(15, 'Расчёт характеристик и подбор оборудования (Kimi)…');
    const r = await calcSystemViaKimi(systemId, true);
    if (!r.ok) throw new Error(r.error || 'Расчёт не удался');
    return {
      systemId,
      result: { total: r.data?.total, clientPrice: r.data?.clientPrice, code: r.data?.code },
    };
  });
}
