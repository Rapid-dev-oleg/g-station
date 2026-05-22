'use server';

/**
 * Server actions для проектов — мутации.
 */

import type { ProjectStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';

/** Поля карточки проекта. */
export interface ProjectInput {
  name: string;
  objectName: string;
  clientId: string;
  ownerId: string;
  deadline?: string | null;
}

/** Создаёт проект. */
export async function createProject(input: ProjectInput) {
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

/** Обновляет проект. */
export async function updateProject(
  id: string,
  input: Partial<Omit<ProjectInput, 'ownerId'>>,
) {
  await db.project.update({
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

/** Удаляет проект (системы каскадом). */
export async function deleteProject(id: string) {
  await db.project.delete({ where: { id } });
  revalidatePath('/projects');
  return { id };
}

/** Меняет статус проекта. */
export async function setProjectStatus(id: string, status: ProjectStatus) {
  await db.project.update({ where: { id }, data: { status } });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { id, status };
}
