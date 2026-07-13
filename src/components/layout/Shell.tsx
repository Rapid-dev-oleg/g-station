import type { ReactNode } from 'react';
import { auth } from '@/server/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import styles from './Shell.module.css';

/** Корневая оболочка приложения — сайдбар + хедер + контент. */
export async function Shell({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const isSuperAdmin = !!user?.isSuperAdmin;

  return (
    <div className={styles.shell}>
      <Sidebar isSuperAdmin={isSuperAdmin} />
      <div className={styles.main}>
        <Header
          userName={user?.name ?? 'Пользователь'}
          userRole={isSuperAdmin ? 'Супер-админ' : 'Пользователь'}
        />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
