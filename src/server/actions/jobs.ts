'use server';

/**
 * Серверные действия очереди задач: постановка в очередь и опрос статуса.
 * UI поллит статус — задача переживает уход со страницы (выполняется на сервере).
 * Задачи изолированы по воркспейсу (список/статус видит только свой воркспейс);
 * фоновый воркер общий, но каждая задача несёт workspaceId.
 */

import { enqueueJob, requestCancel } from '@/server/jobs/runner';
import { ensureJobHandlers } from '@/server/jobs/handlers';
import { stagePackageToDir } from '@/server/actions/parse';
import { requireWorkspace, scopedDb } from '@/server/workspace-db';

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
  const { workspaceId } = await requireWorkspace();
  const db = scopedDb(workspaceId);
  const system = await db.system.findUnique({ where: { id: systemId }, select: { name: true, projectId: true } });
  if (!system) throw new Error('Система не найдена в вашем воркспейсе');
  // Не плодим дубль: если по системе уже есть активная задача — возвращаем её.
  const active = await db.job.findFirst({
    where: { type: 'calc', systemId, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) return { jobId: active.id };
  const jobId = await enqueueJob({
    type: 'calc',
    label: system.name ?? 'Расчёт системы',
    input: { systemId },
    systemId,
    projectId: system.projectId,
    workspaceId,
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
  const { workspaceId } = await requireWorkspace();
  const db = scopedDb(workspaceId);
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

  // Дедуп: если тот же пакет уже в очереди/разбирается в этом воркспейсе — не
  // плодим вторую задачу (иначе из одного парсинга создаётся два проекта).
  const active = await db.job.findFirst({
    where: { type: 'parse', label, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return { ok: true, jobId: active.id };
  }

  const jobId = await enqueueJob({
    type: 'parse',
    label,
    input: { dir, files, ownerId, lockedProjectId, workspaceId },
    projectId: lockedProjectId,
    workspaceId,
  });
  return { ok: true, jobId };
}

/** Статус задачи по id (в своём воркспейсе). */
export async function getJob(id: string): Promise<JobView | null> {
  const db = scopedDb((await requireWorkspace()).workspaceId);
  const j = await db.job.findUnique({ where: { id } });
  return j ? toView(j) : null;
}

/** Последняя задача расчёта по системе (для опроса со страницы системы). */
export async function getJobForSystem(systemId: string): Promise<JobView | null> {
  const db = scopedDb((await requireWorkspace()).workspaceId);
  const j = await db.job.findFirst({ where: { systemId }, orderBy: { createdAt: 'desc' } });
  return j ? toView(j) : null;
}

/**
 * Остановить задачу. Если выполняется — прерывает агента (убивается дочерний
 * процесс CLI). Если ещё в очереди — снимается до старта. Идемпотентно: для уже
 * завершённой задачи ничего не делает.
 */
export async function cancelJob(id: string): Promise<{ ok: boolean }> {
  const db = scopedDb((await requireWorkspace()).workspaceId);
  const job = await db.job.findUnique({ where: { id }, select: { status: true } });
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return { ok: false };
  // Сигнал воркеру: прерывает живой AbortController. Возвращает true, только если
  // задача реально выполняется в этом процессе — тогда воркер сам закроет её.
  const liveAborted = requestCancel(id);
  // Нет живого процесса (queued или «зомби» running от прошлого сервера) —
  // финализируем статус прямо здесь, иначе задача висела бы вечно.
  if (!liveAborted) {
    await db.job
      .updateMany({ where: { id }, data: { status: 'cancelled', finishedAt: new Date(), message: 'Остановлено' } })
      .catch(() => {});
  }
  return { ok: true };
}

/** Список задач воркспейса (последние N) — для общего экрана/индикатора. */
export async function listJobs(limit = 30): Promise<JobView[]> {
  const db = scopedDb((await requireWorkspace()).workspaceId);
  const rows = await db.job.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100) });
  return rows.map(toView);
}
