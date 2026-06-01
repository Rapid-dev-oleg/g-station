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
}

export interface JobOutput {
  result?: unknown;
  projectId?: string;
  systemId?: string;
}

export type JobHandler = (input: unknown, ctx: JobContext) => Promise<JobOutput>;

type QueueState = { running: boolean; handlers: Record<string, JobHandler>; staleReset: boolean };

const g = globalThis as unknown as { __gstationQueue?: QueueState };
const Q: QueueState = (g.__gstationQueue ??= { running: false, handlers: {}, staleReset: false });

/** Регистрирует обработчик типа задачи ('parse' | 'calc' | …). */
export function registerJobHandler(type: string, fn: JobHandler): void {
  Q.handlers[type] = fn;
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
}): Promise<string> {
  await resetStaleJobs();
  const job = await db.job.create({
    data: {
      type: params.type,
      label: params.label,
      input: (params.input ?? null) as object,
      projectId: params.projectId,
      systemId: params.systemId,
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

      await db.job.update({
        where: { id: job.id },
        data: { status: 'running', startedAt: new Date(), progress: 5, message: 'Старт…' },
      });

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
        const out = await handler(job.input, { jobId: job.id, progress });
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
        await db.job.update({
          where: { id: job.id },
          data: {
            status: 'error',
            finishedAt: new Date(),
            error: (e instanceof Error ? e.message : String(e)).slice(0, 800),
          },
        });
      }
    }
  } finally {
    Q.running = false;
  }
}
