'use server';

/**
 * Экшены расчётного конвейера (Фаза 3, подключение к UI). Обёртки над
 * src/server/pipeline/runner: старт прогона из мастера «Вход» и пошаговое
 * исполнение в одной сессии агента. Доступ — любой инженер.
 */
import { requireUser } from '@/server/auth';
import { requireWorkspace, scopedDb } from '@/server/workspace-db';
import { enqueueJob } from '@/server/jobs/runner';
import { ensureJobHandlers } from '@/server/jobs/handlers';
import { db } from '@/server/db';
import { startPipeline, runNextStep, getPipelineRun, saveStepEdit, type StepState, type RunSummary } from '@/server/pipeline/runner';
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
export async function startPipelineRun(input: {
  typeCode: string;
  card: unknown;
  /** Привязать прогон к System (Фаза A: результат пишется обратно в неё). */
  systemId?: string;
  projectId?: string;
}): Promise<{ id: string }> {
  await requireUser();
  ensureJobHandlers();
  const { workspaceId } = await requireWorkspace();
  const id = await startPipeline({ typeCode: input.typeCode, card: input.card, systemId: input.systemId });
  await enqueueJob({
    type: 'pipeline',
    label: `Расчёт: ${input.typeCode}`,
    input: { runId: id },
    systemId: input.systemId,
    projectId: input.projectId,
    workspaceId,
  });
  return { id };
}

/**
 * Старт конвейерного расчёта ДЛЯ существующей системы (Фаза A: мост System↔прогон).
 * Карточку берём из dossier системы (первая станция), тип — из System.typeCode.
 * Прогон привязывается к System (systemId) → по готовности результат пишется в неё.
 */
export async function startSystemPipeline(systemId: string): Promise<{ id: string }> {
  await requireUser();
  ensureJobHandlers();
  const { workspaceId } = await requireWorkspace();
  const wdb = scopedDb(workspaceId);
  const system = await wdb.system.findUnique({
    where: { id: systemId },
    include: { project: true },
  });
  if (!system) throw new Error('Система не найдена в вашем воркспейсе');
  const dossier = system.dossier as { stations?: { input?: unknown }[]; meta?: { object_name?: string } } | null;
  const station = dossier?.stations?.[0];
  const card = {
    станция: system.name,
    объект: dossier?.meta?.object_name ?? system.project?.objectName ?? undefined,
    input: station?.input ?? {},
  };
  const id = await startPipeline({ typeCode: system.typeCode, card, systemId });
  await enqueueJob({
    type: 'pipeline',
    label: `Расчёт: ${system.name}`,
    input: { runId: id },
    systemId,
    projectId: system.projectId,
    workspaceId,
  });
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

/**
 * «Далее»: выполнить СЛЕДУЮЩИЙ шаг (пошаговый контроль). Ставит фоновую задачу на
 * один шаг — после него прогон снова встанет на паузу для проверки инженером.
 */
export async function continuePipeline(runId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  ensureJobHandlers();
  const { workspaceId } = await requireWorkspace();
  const run = await getPipelineRun(runId);
  if (!run) return { ok: false, error: 'Прогон не найден' };
  if (!run.steps || !(run.steps as unknown[]).some((s) => (s as StepState).status === 'pending')) {
    return { ok: false, error: 'Все шаги уже выполнены' };
  }
  await db.pipelineRun.update({ where: { id: runId }, data: { status: 'running' } });
  await enqueueJob({
    type: 'pipeline', label: `Расчёт: ${run.typeCode}`, input: { runId },
    systemId: run.systemId ?? undefined, workspaceId,
  });
  return { ok: true };
}

/** Сохранить правку инженера для вывода шага (учтётся на следующем шаге). */
export async function applyStepEdit(runId: string, stepKey: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  try {
    await saveStepEdit(runId, stepKey, text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка сохранения правки' };
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
