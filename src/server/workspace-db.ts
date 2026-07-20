/**
 * Изоляция данных по воркспейсу (мультитенантность).
 *
 * scopedDb(workspaceId) — Prisma-клиент, который для АРЕНДУЕМЫХ моделей
 * (Client/Project/System/Job) сам подмешивает фильтр по воркспейсу:
 *  - create/createMany: подмешивает data.workspaceId;
 *  - findFirst/findMany/count/aggregate/groupBy/update/delete/updateMany/deleteMany:
 *    подмешивает where.workspaceId (update/delete — через extendedWhereUnique, Prisma 6);
 *  - findUnique: пост-фильтр по workspaceId (в его where доп. поля нельзя).
 * Прочие (общие) модели проходят без изменений.
 *
 * Использовать вместо прямого `db` в request-context (server actions, загрузчики
 * страниц). Фоновый воркер сессии не имеет — там workspaceId передаётся явно.
 */
import { cache } from 'react';
import { db } from '@/server/db';
import { requireUser } from '@/server/auth';
import type { Role } from '@prisma/client';

const TENANT = new Set(['Client', 'Project', 'System', 'Job']);

export function scopedDb(workspaceId: string) {
  return db.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!TENANT.has(model)) return query(args);
          switch (operation) {
            case 'create':
              args.data = { ...args.data, workspaceId };
              break;
            case 'createMany':
              args.data = Array.isArray(args.data)
                ? args.data.map((x: object) => ({ ...x, workspaceId }))
                : { ...args.data, workspaceId };
              break;
            case 'findUnique':
            case 'findUniqueOrThrow': {
              const res = await query(args);
              if (res && res.workspaceId === workspaceId) return res;
              if (operation === 'findUniqueOrThrow') throw new Error('Запись не найдена');
              return null;
            }
            case 'upsert':
              args.where = { ...args.where, workspaceId };
              args.create = { ...args.create, workspaceId };
              break;
            default:
              // findFirst/findMany/count/aggregate/groupBy/update/delete/updateMany/deleteMany
              args.where = { ...args.where, workspaceId };
          }
          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;

export interface WorkspaceCtx {
  userId: string;
  workspaceId: string;
  role: Role;
  isSuperAdmin: boolean;
}

/**
 * Активный воркспейс текущего пользователя. Пока — первая (по времени)
 * membership. Переключатель воркспейсов для мульти-членства — следующий шаг.
 * Бросает, если аккаунт не привязан ни к одному воркспейсу.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceCtx> => {
  const user = await requireUser();
  const m = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });
  if (!m) throw new Error('Нет доступа: аккаунт не привязан ни к одному воркспейсу');
  return { userId: user.id, workspaceId: m.workspaceId, role: m.role, isSuperAdmin: !!user.isSuperAdmin };
});

/** Скоуп-клиент для активного воркспейса (request-context). */
export async function workspaceDb(): Promise<ScopedDb> {
  const { workspaceId } = await requireWorkspace();
  return scopedDb(workspaceId);
}
