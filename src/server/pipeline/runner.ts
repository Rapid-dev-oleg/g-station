/**
 * Оркестратор конвейера (Фаза 3). Прогоняет шаги ПОСЛЕДОВАТЕЛЬНО в ОДНОЙ сессии
 * агента (session-runner), сохраняя контекст между шагами. Состояние — в
 * PipelineRun (переживает уход со страницы, поддерживает гейты/паузы). Data-driven:
 * директивы шагов хранятся в самом прогоне, поэтому шаги можно задавать (в т.ч.
 * тривиальные — для тестов оркестрации).
 */
import { db } from '@/server/db';
import { runAgentStep } from '@/server/ai/session-runner';
import { PIPELINE_STEPS, type StepDef } from './steps';

export interface StepState {
  key: string;
  label: string;
  directive: string;
  status: 'pending' | 'done' | 'error';
  output: string | null;
  at: string | null;
}

/** Создаёт прогон конвейера. steps по умолчанию — PIPELINE_STEPS. */
export async function startPipeline(input: {
  typeCode: string;
  card: unknown;
  systemId?: string;
  steps?: StepDef[];
}): Promise<string> {
  const defs = input.steps ?? PIPELINE_STEPS;
  const steps: StepState[] = defs.map((s) => ({
    key: s.key, label: s.label, directive: s.directive, status: 'pending', output: null, at: null,
  }));
  const run = await db.pipelineRun.create({
    data: {
      typeCode: input.typeCode,
      systemId: input.systemId ?? null,
      card: (input.card ?? {}) as object,
      steps: steps as unknown as object,
      status: 'running',
      currentStep: 0,
    },
  });
  return run.id;
}

/**
 * Исполняет следующий pending-шаг в общей сессии. Первый исполняемый шаг
 * засевает карточку в сессию; остальные полагаются на память сессии.
 * Возвращает результат шага и остались ли ещё шаги. При гейтах вызывающий
 * решает, продолжать ли (можно ставить status='paused' между вызовами).
 */
export async function runNextStep(
  runId: string,
  opts?: { skill?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ done: boolean; step?: StepState; sessionId?: string }> {
  const run = await db.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Прогон конвейера не найден');
  const steps = run.steps as unknown as StepState[];
  const idx = steps.findIndex((s) => s.status === 'pending');
  if (idx === -1) return { done: true };

  const step = steps[idx];
  const anyDone = steps.some((s) => s.status !== 'pending');
  const prompt = anyDone
    ? step.directive
    : `Карточка станции (шаг «Вход» уже выполнен инженером):\n${JSON.stringify(run.card, null, 2)}\n\n${step.directive}`;

  let res: { output: string; sessionId: string };
  try {
    res = await runAgentStep({
      prompt,
      skill: opts?.skill ?? 'pump-station-calc',
      sessionId: run.sessionId ?? undefined,
      timeoutMs: opts?.timeoutMs,
      signal: opts?.signal,
    });
  } catch (e) {
    steps[idx] = { ...step, status: 'error', output: (e as Error).message, at: new Date().toISOString() };
    await db.pipelineRun.update({ where: { id: runId }, data: { steps: steps as unknown as object, status: 'error' } });
    throw e;
  }

  steps[idx] = { ...step, status: 'done', output: res.output, at: new Date().toISOString() };
  const remaining = steps.some((s) => s.status === 'pending');
  await db.pipelineRun.update({
    where: { id: runId },
    data: {
      steps: steps as unknown as object,
      sessionId: res.sessionId || run.sessionId,
      currentStep: idx + 1,
      status: remaining ? 'running' : 'done',
    },
  });
  return { done: !remaining, step: steps[idx], sessionId: res.sessionId };
}

export async function getPipelineRun(runId: string) {
  return db.pipelineRun.findUnique({ where: { id: runId } });
}
