'use server';

/**
 * Server actions для проектов — мутации. Изолировано по воркспейсу.
 */

import type { ProjectStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { workspaceDb } from '@/server/workspace-db';

/** Поля карточки проекта. */
export interface ProjectInput {
  name: string;
  objectName: string;
  clientId: string;
  ownerId: string;
  deadline?: string | null;
}

/** Создаёт проект в активном воркспейсе (клиент должен быть из него же). */
export async function createProject(input: ProjectInput) {
  const db = await workspaceDb();
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new Error('Клиент не найден в вашем воркспейсе');
  const project = await db.project.create({
    data: {
      name: input.name,
      objectName: input.objectName,
      clientId: input.clientId,
      ownerId: input.ownerId,
      deadline: input.deadline ? new Date(input.deadline) : null,
    },
  });
  revalidatePath('/projects');
  return { id: project.id };
}

/** Обновляет проект (только в своём воркспейсе). */
export async function updateProject(
  id: string,
  input: Partial<Omit<ProjectInput, 'ownerId'>>,
) {
  const db = await workspaceDb();
  await db.project.updateMany({
    where: { id },
    data: {
      name: input.name,
      objectName: input.objectName,
      clientId: input.clientId,
      deadline:
        input.deadline === undefined
          ? undefined
          : input.deadline
            ? new Date(input.deadline)
            : null,
    },
  });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { id };
}

/** Удаляет проект (системы каскадом; только в своём воркспейсе). */
export async function deleteProject(id: string) {
  const db = await workspaceDb();
  await db.project.deleteMany({ where: { id } });
  revalidatePath('/projects');
  return { id };
}

/** Меняет статус проекта. */
export async function setProjectStatus(id: string, status: ProjectStatus) {
  const db = await workspaceDb();
  await db.project.updateMany({ where: { id }, data: { status } });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { id, status };
}
