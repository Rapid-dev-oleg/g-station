/**
 * Очередь фоновых задач (парсинг ТЗ / расчёт станции).
 *
 * Задачи выполняются на СЕРВЕРЕ, последовательно (по одной — Kimi-агент тяжёлый),
 * прогресс и результат пишутся в БД (таблица Job). Поэтому задача НЕ ломается при
 * уходе со страницы: запустил → перешёл в другой проект → вернулся и видишь
 * результат. UI поллит статус из БД.
 *
 * Движок in-process: воркер живёт в процессе Next-сервера. Синглтон через
 * globalThis — переживает HMR в dev. При рестарте сервера «зависшие» running
 * помечаются ошибкой (см. resetStaleJobs).
 */

import { db } from '@/server/db';

export interface JobContext {
  jobId: string;
  /** Обновить прогресс (0..100) и текущий шаг. */
  progress: (pct: number, message?: string) => Promise<void>;
  /** Прерывается при остановке задачи пользователем — прокидывается в агент (execFile),
   *  чтобы убить дочерний процесс, а не ждать таймаута. */
  signal: AbortSignal;
}

export interface JobOutput {
  result?: unknown;
  projectId?: string;
  systemId?: string;
}

export type JobHandler = (input: unknown, ctx: JobContext) => Promise<JobOutput>;

type QueueState = {
  running: boolean;
  handlers: Record<string, JobHandler>;
  staleReset: boolean;
  /** AbortController выполняемой сейчас задачи (по jobId). */
  controllers: Record<string, AbortController>;
  /** jobId, для которых запрошена остановка (ещё в очереди или в момент старта). */
  cancelRequested: Set<string>;
};

const g = globalThis as unknown as { __gstationQueue?: QueueState };
const Q: QueueState = (g.__gstationQueue ??= {
  running: false,
  handlers: {},
  staleReset: false,
  controllers: {},
  cancelRequested: new Set(),
});
// Синглтон мог пережить HMR/обновление кода со старой формой — дозаполняем поля,
// чтобы отмена не падала на undefined.
Q.controllers ??= {};
Q.cancelRequested ??= new Set();

/** Регистрирует обработчик типа задачи ('parse' | 'calc' | …). */
export function registerJobHandler(type: string, fn: JobHandler): void {
  Q.handlers[type] = fn;
}

/**
 * Запрос на остановку задачи. Если задача реально выполняется в ЭТОМ процессе —
 * прерывает её AbortController (агент получает signal → execFile убивает дочерний
 * процесс), и воркер сам переведёт её в 'cancelled'. Возвращает true в этом случае.
 *
 * Возвращает false, если живого процесса для задачи нет (ещё в очереди ИЛИ «зомби»
 * running от прошлого процесса сервера): тогда финализировать статус в БД должен
 * вызывающий (см. cancelJob).
 */
export function requestCancel(jobId: string): boolean {
  Q.cancelRequested.add(jobId);
  const ac = Q.controllers[jobId];
  if (ac) {
    ac.abort();
    return true;
  }
  return false;
}

/**
 * Выполняет долгую операцию `fn`, плавно двигая прогресс по ВРЕМЕНИ к ~92%
 * за ожидаемые `etaSec` секунд и показывая «осталось ~N мин» (агент не отдаёт
 * реальный %, поэтому оценка по времени — но бар движется и есть ETA). По
 * завершении вызывающий ставит 100%.
 */
export async function runWithEta<T>(
  ctx: JobContext,
  etaSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  let elapsed = 0;
  await ctx.progress(8, `осталось ~${Math.ceil(etaSec / 60)} мин`);
  const timer = setInterval(() => {
    elapsed += 5;
    const pct = Math.min(92, 8 + (elapsed / etaSec) * 84);
    const leftSec = Math.max(0, Math.round(etaSec - elapsed));
    const msg = leftSec > 0 ? `осталось ~${Math.ceil(leftSec / 60)} мин` : 'почти готово…';
    void ctx.progress(pct, msg);
  }, 5000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}

/** Помечает «зависшие» running-задачи ошибкой (один раз после рестарта сервера). */
async function resetStaleJobs(): Promise<void> {
  if (Q.staleReset) return;
  Q.staleReset = true;
  await db.job
    .updateMany({ where: { status: 'running' }, data: { status: 'error', error: 'Прервано рестартом сервера' } })
    .catch(() => {});
}

/** Ставит задачу в очередь и запускает воркер. Возвращает id задачи. */
export async function enqueueJob(params: {
  type: string;
  label?: string;
  input?: unknown;
  projectId?: string;
  systemId?: string;
  /** Воркспейс-владелец задачи (для изоляции списка задач). */
  workspaceId?: string;
}): Promise<string> {
  await resetStaleJobs();
  const job = await db.job.create({
    data: {
      type: params.type,
      label: params.label,
      input: (params.input ?? null) as object,
      projectId: params.projectId,
      systemId: params.systemId,
      workspaceId: params.workspaceId,
      status: 'queued',
    },
  });
  void pump();
  return job.id;
}

/** Воркер: пока есть queued-задачи — выполняет их по одной. */
async function pump(): Promise<void> {
  if (Q.running) return;
  Q.running = true;
  try {
    for (;;) {
      const job = await db.job.findFirst({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' } });
      if (!job) break;

      // Сняли, пока ждал в очереди — не запускаем вовсе.
      if (Q.cancelRequested.has(job.id)) {
        Q.cancelRequested.delete(job.id);
        await db.job
          .update({ where: { id: job.id }, data: { status: 'cancelled', finishedAt: new Date(), message: 'Остановлено' } })
          .catch(() => {});
        continue;
      }

      await db.job.update({
        where: { id: job.id },
        data: { status: 'running', startedAt: new Date(), progress: 5, message: 'Старт…' },
      });

      const ac = new AbortController();
      Q.controllers[job.id] = ac;
      // Остановку могли запросить ровно в момент старта — учитываем гонку.
      if (Q.cancelRequested.has(job.id)) ac.abort();

      const handler = Q.handlers[job.type];
      const progress = async (pct: number, message?: string) => {
        await db.job
          .update({
            where: { id: job.id },
            data: { progress: Math.max(0, Math.min(100, Math.round(pct))), message: message ?? undefined },
          })
          .catch(() => {});
      };

      try {
        if (!handler) throw new Error(`Нет обработчика для задачи «${job.type}»`);
        const out = await handler(job.input, { jobId: job.id, progress, signal: ac.signal });
        await db.job.update({
          where: { id: job.id },
          data: {
            status: 'done',
            progress: 100,
            message: 'Готово',
            finishedAt: new Date(),
            result: (out.result ?? null) as object,
            projectId: out.projectId ?? job.projectId,
            systemId: out.systemId ?? job.systemId,
          },
        });
      } catch (e) {
        // Прервано пользователем (abort) → 'cancelled', а не 'error'.
        const cancelled = ac.signal.aborted || Q.cancelRequested.has(job.id);
        await db.job.update({
          where: { id: job.id },
          data: cancelled
            ? { status: 'cancelled', finishedAt: new Date(), message: 'Остановлено', error: null }
            : {
                status: 'error',
                finishedAt: new Date(),
                error: (e instanceof Error ? e.message : String(e)).slice(0, 800),
              },
        });
      } finally {
        delete Q.controllers[job.id];
        Q.cancelRequested.delete(job.id);
      }
    }
  } finally {
    Q.running = false;
  }
}
