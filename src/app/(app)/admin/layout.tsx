import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';

/**
 * Гейт раздела управления доступом: только платформенный супер-админ.
 * Первый из трёх рубежей (ещё — requireSuperAdmin в каждом server action и
 * скрытая ссылка в сайдбаре).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isSuperAdmin) redirect('/');
  return <>{children}</>;
}
