import type { ReactNode } from 'react';
import { auth } from '@/server/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import styles from './Shell.module.css';

/** Корневая оболочка приложения — сайдбар + хедер + контент. */
export async function Shell({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header
          userName={user?.name ?? 'Инженер'}
          userRole={user?.role === 'ADMIN' ? 'Администратор' : 'Инженер'}
        />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
