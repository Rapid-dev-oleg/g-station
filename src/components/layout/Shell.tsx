import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../ui/Toast';
import styles from './Shell.module.css';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <div className={styles.content}>{children}</div>
      </div>
      <ToastContainer />
    </div>
  );
}
