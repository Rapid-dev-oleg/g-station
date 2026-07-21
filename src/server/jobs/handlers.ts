/**
 * Регистрация обработчиков фоновых задач. Импортируется из job-actions, чтобы
 * обработчики были зарегистрированы до постановки задач в очередь.
 */

import { registerJobHandler, runWithEta } from './runner';
import { calcSystemViaKimi } from '@/server/actions/kimi-calc';
import { runParseJob, type ParsedFileInfo } from '@/server/actions/parse';
import { runNextStep, getPipelineRun, summarizeRun } from '@/server/pipeline/runner';

let registered = false;

export function ensureJobHandlers(): void {
  if (registered) return;
  registered = true;

  // Парсинг ТЗ: агент читает файлы из временной папки сам (read_media/shell).
  // ETA по суммарному размеру файлов (тяжёлые сканы дольше). Результат —
  // ParseResponse (redirect на созданный проект/систему или review).
  registerJobHandler('parse', async (input, ctx) => {
    const p = input as { dir: string; files: ParsedFileInfo[]; ownerId?: string; lockedProjectId?: string; workspaceId?: string };
    const mb = p.files.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    const etaSec = Math.round(120 + mb * 9); // ~84 МБ → ~14.5 мин
    const resp = await runWithEta(ctx, etaSec, () =>
      runParseJob({ ...p, workspaceId: p.workspaceId ?? '', signal: ctx.signal }),
    );
    if (!resp.ok) throw new Error(resp.error); // провал → задача 'error'
    let projectId: string | undefined;
    let systemId: string | undefined;
    if (resp.mode === 'redirect') {
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
  // Конвейер «шаг = скил»: гонит шаги ПОСЛЕДОВАТЕЛЬНО в одной сессии агента
  // (runNextStep персистит каждый шаг в PipelineRun). Страница прогона поллит
  // PipelineRun → живой прогресс по шагам. Прогресс задачи — грубый по шагам.
  registerJobHandler('pipeline', async (input, ctx) => {
    const { runId } = input as { runId: string };
    for (;;) {
      if (ctx.signal.aborted) throw new Error('Остановлено');
      const run = await getPipelineRun(runId);
      if (!run) throw new Error('Прогон конвейера не найден');
      const steps = (run.steps as { key: string; label: string; status: string }[]) ?? [];
      const nextIdx = steps.findIndex((s) => s.status === 'pending');
      if (nextIdx === -1) break; // все шаги пройдены
      const doneCount = steps.filter((s) => s.status === 'done').length;
      await ctx.progress(Math.round((doneCount / steps.length) * 95), `Шаг ${nextIdx + 1}/${steps.length}: ${steps[nextIdx].label}`);
      // фоновая задача, не HTTP → щедрый таймаут на шаг (Выход бывает ~11 мин)
      await runNextStep(runId, { timeoutMs: 15 * 60 * 1000, signal: ctx.signal });
    }
    // финальная структурная сводка (best-effort — не валит расчёт при ошибке)
    await ctx.progress(97, 'Сводка результата…');
    await summarizeRun(runId, ctx.signal).catch(() => {});
    await ctx.progress(100, 'Готово');
    return { result: { runId } };
  });

  registerJobHandler('calc', async (input, ctx) => {
    const { systemId } = input as { systemId: string };
    // Расчёт+подбор через Kimi+MCP — ориентир ~9 мин.
    const r = await runWithEta(ctx, 540, () => calcSystemViaKimi(systemId, true, ctx.signal));
    if (!r.ok) throw new Error(r.error || 'Расчёт не удался');
    return {
      systemId,
      result: { total: r.data?.total, clientPrice: r.data?.clientPrice, code: r.data?.code },
    };
  });
}
