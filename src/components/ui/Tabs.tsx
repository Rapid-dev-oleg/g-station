'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export type TabItem = {
  key: string;
  label: ReactNode;
  count?: number;
};

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={clsx(styles.tabs, className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={clsx(styles.tab, active === t.key && styles.active)}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className={styles.pill}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
