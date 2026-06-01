'use server';

/**
 * Серверные действия очереди задач: постановка в очередь и опрос статуса.
 * UI поллит статус — задача переживает уход со страницы (выполняется на сервере).
 */

import { db } from '@/server/db';
import { enqueueJob } from '@/server/jobs/runner';
import { ensureJobHandlers } from '@/server/jobs/handlers';
import { stagePackageToDir } from '@/server/actions/parse';

export interface JobView {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string | null;
  label: string | null;
  error: string | null;
  projectId: string | null;
  systemId: string | null;
  result: unknown;
  createdAt: string;
  finishedAt: string | null;
}

function toView(j: {
  id: string; type: string; status: string; progress: number; message: string | null;
  label: string | null; error: string | null; projectId: string | null; systemId: string | null;
  result: unknown; createdAt: Date; finishedAt: Date | null;
}): JobView {
  return {
    id: j.id, type: j.type, status: j.status, progress: j.progress, message: j.message,
    label: j.label, error: j.error, projectId: j.projectId, systemId: j.systemId,
    result: j.result ?? null,
    createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null,
  };
}

/** Поставить расчёт системы в очередь. Возвращает id задачи (не ждёт расчёта). */
export async function enqueueCalc(systemId: string): Promise<{ jobId: string }> {
  ensureJobHandlers();
  const system = await db.system.findUnique({ where: { id: systemId }, select: { name: true, projectId: true } });
  // Не плодим дубль: если по системе уже есть активная задача — возвращаем её.
  const active = await db.job.findFirst({
    where: { type: 'calc', systemId, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) return { jobId: active.id };
  const jobId = await enqueueJob({
    type: 'calc',
    label: system?.name ?? 'Расчёт системы',
    input: { systemId },
    systemId,
    projectId: system?.projectId,
  });
  return { jobId };
}

/** Поставить парсинг пакета ТЗ в очередь. Файлы складываются в temp-папку,
 *  агент прочитает их в фоне. Возвращает id задачи (не ждёт разбора). */
export async function enqueueParse(
  formData: FormData,
  ownerId: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  ensureJobHandlers();
  let dir: string;
  let files: { filename: string; format: string; size: number }[];
  try {
    const staged = await stagePackageToDir(formData);
    dir = staged.dir;
    files = staged.files;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка приёма файлов' };
  }
  const lockedProjectId = (formData.get('projectId') as string | null)?.trim() || undefined;
  const label = files.map((f) => f.filename).join(', ').slice(0, 120);
  const jobId = await enqueueJob({
    type: 'parse',
    label,
    input: { dir, files, ownerId, lockedProjectId },
    projectId: lockedProjectId,
  });
  return { ok: true, jobId };
}

/** Статус задачи по id. */
export async function getJob(id: string): Promise<JobView | null> {
  const j = await db.job.findUnique({ where: { id } });
  return j ? toView(j) : null;
}

/** Последняя задача расчёта по системе (для опроса со страницы системы). */
export async function getJobForSystem(systemId: string): Promise<JobView | null> {
  const j = await db.job.findFirst({ where: { systemId }, orderBy: { createdAt: 'desc' } });
  return j ? toView(j) : null;
}

/** Список задач (последние N) — для общего экрана/индикатора. */
export async function listJobs(limit = 30): Promise<JobView[]> {
  const rows = await db.job.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100) });
  return rows.map(toView);
}
