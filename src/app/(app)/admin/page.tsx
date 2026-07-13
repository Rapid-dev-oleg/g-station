import { getAdminData } from '@/server/actions/admin';
import { AdminManager } from '@/components/admin/AdminManager';

export const dynamic = 'force-dynamic';

/** Управление доступом: воркспейсы, пользователи, роли. Доступ — супер-админ. */
export default async function AdminPage() {
  const { workspaces, users } = await getAdminData();
  return <AdminManager workspaces={workspaces} users={users} />;
}
