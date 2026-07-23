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
import { stepForm, stepJsonInstruction, parseStepData } from '@/lib/pipeline/step-forms';
import type { FieldSpec } from '@/lib/schema/types';

/** Схема ВЫВОДА шага (форма). selection — из specSchema типа; прочее — FIRE_STEP_FORMS (пилот fire). */
export async function resolveStepForm(typeCode: string, stepKey: string): Promise<FieldSpec[] | null> {
  let spec: FieldSpec[] | null = null;
  if (stepKey === 'selection') {
    const t = await db.systemType.findUnique({ where: { code: typeCode }, select: { specSchema: true } });
    spec = (t?.specSchema as unknown as FieldSpec[] | null) ?? null;
  }
  return stepForm(typeCode, stepKey, spec);
}

/** Структурная сводка расчёта (для чистого экрана результата). */
export interface RunSummary {
  characteristics?: { Q?: string; H?: string; scheme?: string; pump?: string; power?: string; start?: string };
  equipment?: { name: string; spec?: string; qty?: string }[];
  estimate?: { rows?: { item: string; source?: string; cost?: number }[]; cost_total?: number; client_price?: number };
  cipher?: string;
  gates?: string[];
}

export interface StepState {
  key: string;
  label: string;
  directive: string;
  status: 'pending' | 'done' | 'error';
  output: string | null;
  /** Структурированный результат шага (по схеме формы) — редактируемая форма в UI. */
  data?: Record<string, unknown> | null;
  at: string | null;
  /** Инженер вручную поправил результат этого шага (учитывается дальше). */
  edited?: boolean;
}

/** Правка инженера, ожидающая подмешивания в сессию на следующем шаге. */
interface PendingEdit { key: string; label: string; text: string }

/**
 * Создаёт прогон конвейера. Шаги берёт из ТИПА (TypeStep, kind≠input, по order);
 * если у типа шагов нет — из PIPELINE_STEPS (fallback). Можно передать steps явно
 * (для тестов).
 */
export async function startPipeline(input: {
  typeCode: string;
  card: unknown;
  systemId?: string;
  steps?: StepDef[];
}): Promise<string> {
  let defs: StepDef[];
  if (input.steps) {
    defs = input.steps;
  } else {
    const rows = await db.typeStep.findMany({
      where: { typeCode: input.typeCode, kind: { not: 'input' } },
      orderBy: { order: 'asc' },
    });
    defs = rows.length
      ? rows.map((r) => ({ key: r.key, label: r.label, directive: r.directive ?? '' }))
      : PIPELINE_STEPS;
  }
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

  // Подмешиваем правки инженера предыдущих шагов (супервизинг): агент обязан
  // считать их истиной. После использования правки очищаются.
  const state = (run.state as { pendingEdits?: PendingEdit[] } | null) ?? {};
  const edits = state.pendingEdits ?? [];
  const editBlock = edits.length
    ? `\n\n⚠ ИНЖЕНЕР СКОРРЕКТИРОВАЛ предыдущие шаги — считай эти версии ИСТИНОЙ, ` +
      `пересчёт делай от них:\n${edits.map((e) => `— Шаг «${e.label}»:\n${e.text}`).join('\n\n')}`
    : '';

  const base = anyDone
    ? step.directive
    : `Карточка станции (шаг «Вход» уже выполнен инженером):\n${JSON.stringify(run.card, null, 2)}\n\n${step.directive}`;
  // Форма шага: просим агента вернуть СТРУКТУРУ по схеме → редактируемая форма в UI.
  const form = await resolveStepForm(run.typeCode, step.key);
  const prompt = base + editBlock + (form ? stepJsonInstruction(form) : '');

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

  const data = form ? parseStepData(res.output) : null;
  steps[idx] = { ...step, status: 'done', output: res.output, data, at: new Date().toISOString() };
  const remaining = steps.some((s) => s.status === 'pending');
  await db.pipelineRun.update({
    where: { id: runId },
    data: {
      steps: steps as unknown as object,
      sessionId: res.sessionId || run.sessionId,
      currentStep: idx + 1,
      // Пошаговый управляемый режим: после шага — ПАУЗА для проверки/правки инженером.
      status: remaining ? 'paused' : 'done',
      state: { ...state, pendingEdits: [] } as object,
    },
  });
  return { done: !remaining, step: steps[idx], sessionId: res.sessionId };
}

/**
 * Сохранить правку инженера для вывода шага (пошаговый контроль). Обновляет
 * показанный вывод и ставит правку в очередь на подмешивание в сессию перед
 * следующим шагом (runNextStep). Шаг помечается edited.
 */
export async function saveStepEdit(runId: string, stepKey: string, text: string): Promise<void> {
  const run = await db.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Прогон конвейера не найден');
  const steps = run.steps as unknown as StepState[];
  const i = steps.findIndex((s) => s.key === stepKey);
  if (i === -1) throw new Error('Шаг не найден');
  steps[i] = { ...steps[i], output: text, edited: true };
  const state = (run.state as { pendingEdits?: PendingEdit[] } | null) ?? {};
  const pending = (state.pendingEdits ?? []).filter((e) => e.key !== stepKey);
  pending.push({ key: stepKey, label: steps[i].label, text });
  await db.pipelineRun.update({
    where: { id: runId },
    data: { steps: steps as unknown as object, state: { ...state, pendingEdits: pending } as object },
  });
}

/**
 * Сохранить правку инженера ФОРМЫ шага (структурированный результат). Обновляет
 * data шага и ставит правку в очередь на подмешивание в сессию перед следующим
 * шагом (как истину). Шаг помечается edited.
 */
export async function saveStepData(runId: string, stepKey: string, data: Record<string, unknown>): Promise<void> {
  const run = await db.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Прогон конвейера не найден');
  const steps = run.steps as unknown as StepState[];
  const i = steps.findIndex((s) => s.key === stepKey);
  if (i === -1) throw new Error('Шаг не найден');
  steps[i] = { ...steps[i], data, edited: true };
  const state = (run.state as { pendingEdits?: PendingEdit[] } | null) ?? {};
  const pending = (state.pendingEdits ?? []).filter((e) => e.key !== stepKey);
  pending.push({ key: stepKey, label: steps[i].label, text: JSON.stringify(data, null, 2) });
  await db.pipelineRun.update({
    where: { id: runId },
    data: { steps: steps as unknown as object, state: { ...state, pendingEdits: pending } as object },
  });
}

export async function getPipelineRun(runId: string) {
  return db.pipelineRun.findUnique({ where: { id: runId } });
}

/**
 * Пишет результат прогона обратно в привязанную System (если есть systemId):
 * ссылка на прогон + зеркало сметы (totalCost/clientPrice) + статус CALCULATED.
 * System = durable-запись, PipelineRun = журнал исполнения. Best-effort — не
 * валит расчёт, если System нет. Прогоны без systemId (из /calc/new) пропускаются.
 */
export async function finalizePipelineToSystem(runId: string): Promise<void> {
  const run = await db.pipelineRun.findUnique({ where: { id: runId } });
  if (!run?.systemId) return;
  const summary = (run.summary as unknown as RunSummary | null) ?? null;
  const est = summary?.estimate;
  await db.system
    .update({
      where: { id: run.systemId },
      data: {
        pipelineRunId: runId,
        status: 'CALCULATED',
        ...(typeof est?.cost_total === 'number' ? { totalCost: est.cost_total } : {}),
        ...(typeof est?.client_price === 'number' ? { clientPrice: est.client_price } : {}),
      },
    })
    .catch(() => {});
}

/**
 * Финальный проход: агент (в ТОЙ ЖЕ сессии, со всем контекстом расчёта) отдаёт
 * СТРОГИЙ JSON-сводку → чистый экран результата (характеристики/состав/смета/шифр).
 * Best-effort: если не удалось — сводки просто нет, шаги остаются.
 */
export async function summarizeRun(runId: string, signal?: AbortSignal): Promise<void> {
  const run = await db.pipelineRun.findUnique({ where: { id: runId } });
  if (!run?.sessionId) return;
  const prompt =
    'На основе всего проведённого выше расчёта (шаги в этой сессии) выведи ОДИН ' +
    'JSON-блок в ```json ... ``` со сводкой — без пояснений вне блока. Схема:\n' +
    '{\n' +
    '  "characteristics": {"Q":"<напр. 50 м³/ч>","H":"<40 м>","scheme":"<1/1>","pump":"<класс+мощность>","power":"<кВт>","start":"<тип пуска>"},\n' +
    '  "equipment": [{"name":"<позиция>","spec":"<кратко>","qty":"<кол-во>"}],\n' +
    '  "estimate": {"rows":[{"item":"<группа·позиция>","source":"<БД|оценка>","cost":<руб. закупка, число>}],"cost_total":<себестоимость, число>,"client_price":<цена клиенту, число>},\n' +
    '  "cipher": "<шифр изделия>",\n' +
    '  "gates": ["<что требует подтверждения инженера>"]\n' +
    '}\n' +
    'Значения бери из расчёта, не выдумывай. Числа в estimate — числами (рубли, без пробелов/₽).';
  const { output } = await runAgentStep({ prompt, sessionId: run.sessionId, timeoutMs: 4 * 60 * 1000, signal });
  const json = extractJson(output);
  if (json) await db.pipelineRun.update({ where: { id: runId }, data: { summary: json as object } });
}

function extractJson(out: string): unknown | null {
  const fence = out.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : out.match(/\{[\s\S]*\}/)?.[0] ?? '';
  try { return JSON.parse(raw); } catch { return null; }
}
