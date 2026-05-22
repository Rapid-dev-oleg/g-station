'use client';

import clsx from 'clsx';
import { useToastStore } from '@/lib/store/toast';
import styles from './Toast.module.css';

export { toast } from '@/lib/store/toast';

const ICONS = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} className={clsx(styles.toast, styles[t.variant])}>
          <span className={styles.icon}>{ICONS[t.variant]}</span>
          <div className={styles.body}>
            <div className={styles.title}>{t.title}</div>
            {t.message && <div className={styles.message}>{t.message}</div>}
          </div>
          <button type="button" className={styles.close} onClick={() => dismiss(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
