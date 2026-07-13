'use server';

/**
 * Server actions для клиентов — мутации. Данные изолированы по воркспейсу
 * (workspaceDb сам подмешивает workspaceId и фильтрует по нему).
 */

import { revalidatePath } from 'next/cache';
import { workspaceDb } from '@/server/workspace-db';

/** Поля карточки клиента (всё кроме краткого имени — опционально). */
export interface ClientInput {
  shortName: string;
  fullName?: string;
  inn?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  note?: string;
}

/** Создаёт клиента в активном воркспейсе. */
export async function createClient(input: ClientInput) {
  const db = await workspaceDb();
  const client = await db.client.create({ data: input });
  revalidatePath('/clients');
  return { id: client.id };
}

/** Обновляет клиента (только в своём воркспейсе). */
export async function updateClient(id: string, input: Partial<ClientInput>) {
  const db = await workspaceDb();
  await db.client.updateMany({ where: { id }, data: input });
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { id };
}

/** Удаляет клиента (только в своём воркспейсе). */
export async function deleteClient(id: string) {
  const db = await workspaceDb();
  await db.client.deleteMany({ where: { id } });
  revalidatePath('/clients');
  return { id };
}
