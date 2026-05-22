import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {action}
    </div>
  );
}
