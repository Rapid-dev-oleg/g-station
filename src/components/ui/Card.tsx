import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  compact?: boolean;
  flat?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function Card({ compact, flat, title, subtitle, action, children, className, ...rest }: CardProps) {
  return (
    <div className={clsx(styles.card, compact && styles.compact, flat && styles.flat, className)} {...rest}>
      {(title || action) && (
        <div className={styles.header}>
          <div>
            {title && <div className={styles.title}>{title}</div>}
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
