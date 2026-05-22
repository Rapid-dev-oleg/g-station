import clsx from 'clsx';
import styles from './Progress.module.css';

export interface ProgressProps {
  value: number; // 0..100
  size?: 'md' | 'lg';
  className?: string;
}

export function Progress({ value, size = 'md', className }: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx(styles.progress, size === 'lg' && styles.lg, className)}>
      <div className={styles.bar} style={{ width: `${v}%` }} />
    </div>
  );
}
