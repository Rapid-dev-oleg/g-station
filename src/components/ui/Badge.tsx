import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'md' | 'lg';
  withDot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', size = 'md', withDot, children, className }: BadgeProps) {
  return (
    <span className={clsx(styles.badge, styles[variant], size === 'lg' && styles.lg, className)}>
      {withDot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
