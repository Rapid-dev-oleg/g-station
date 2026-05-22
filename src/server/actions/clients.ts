'use server';

/**
 * Server actions для клиентов — мутации.
 */

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';

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

/** Создаёт клиента. */
export async function createClient(input: ClientInput) {
  const client = await db.client.create({ data: input });
  revalidatePath('/clients');
  return { id: client.id };
}

/** Обновляет клиента. */
export async function updateClient(id: string, input: Partial<ClientInput>) {
  await db.client.update({ where: { id }, data: input });
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { id };
}

/** Удаляет клиента. */
export async function deleteClient(id: string) {
  await db.client.delete({ where: { id } });
  revalidatePath('/clients');
  return { id };
}
