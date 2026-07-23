'use server';

/**
 * Экшены расчётного конвейера (Фаза 3, подключение к UI). Обёртки над
 * src/server/pipeline/runner: старт прогона из мастера «Вход» и пошаговое
 * исполнение в одной сессии агента. Доступ — любой инженер.
 */
import { requireUser } from '@/server/auth';
import { requireWorkspace } from '@/server/workspace-db';
import { enqueueJob } from '@/server/jobs/runner';
import { ensureJobHandlers } from '@/server/jobs/handlers';
import { db } from '@/server/db';
import { startPipeline, runNextStep, getPipelineRun, type StepState, type RunSummary } from '@/server/pipeline/runner';
import { coerceCardLayout, type CardLayout } from '@/lib/card/layout';

export interface RunView {
  id: string;
  typeCode: string;
  status: string;
  card: unknown;
  steps: StepState[];
  summary: RunSummary | null;
  /** Дизайн карточки результата (из типа; fallback — дизайн по умолчанию). */
  cardLayout: CardLayout;
}

function shape(
  run: NonNullable<Awaited<ReturnType<typeof getPipelineRun>>>,
  cardLayout: CardLayout,
): RunView {
  return {
    id: run.id,
    typeCode: run.typeCode,
    status: run.status,
    card: run.card,
    steps: (run.steps as unknown as StepState[]) ?? [],
    summary: (run.summary as unknown as RunSummary) ?? null,
    cardLayout,
  };
}

/**
 * Старт прогона из мастера: создаёт PipelineRun и ставит ФОНОВУЮ задачу, которая
 * гонит все шаги в одной сессии агента. Страница прогона поллит прогресс —
 * можно уйти со страницы, расчёт продолжится на сервере.
 */
export async function startPipelineRun(input: { typeCode: string; card: unknown }): Promise<{ id: string }> {
  await requireUser();
  ensureJobHandlers();
  const { workspaceId } = await requireWorkspace();
  const id = await startPipeline({ typeCode: input.typeCode, card: input.card });
  await enqueueJob({ type: 'pipeline', label: `Расчёт: ${input.typeCode}`, input: { runId: id }, workspaceId });
  return { id };
}

/** Выполнить следующий шаг прогона (в общей сессии). Длинный вызов (~минуты). */
export async function runPipelineStep(
  runId: string,
): Promise<{ ok: true; done: boolean; step: StepState | null } | { ok: false; error: string }> {
  await requireUser();
  try {
    const r = await runNextStep(runId, { timeoutMs: 8 * 60 * 1000 });
    return { ok: true, done: r.done, step: r.step ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка выполнения шага' };
  }
}

/** Текущее состояние прогона (для страницы прогона). */
export async function getRun(runId: string): Promise<RunView | null> {
  await requireUser();
  const run = await getPipelineRun(runId);
  if (!run) return null;
  const type = await db.systemType.findUnique({ where: { code: run.typeCode }, select: { cardLayout: true } });
  return shape(run, coerceCardLayout(type?.cardLayout));
}
