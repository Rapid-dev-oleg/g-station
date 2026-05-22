import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className={styles.tooltipWrap}>
      {children}
      <span className={styles.tip}>{content}</span>
    </span>
  );
}
