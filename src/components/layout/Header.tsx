'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useMemo } from 'react';
import { Avatar, IconButton } from '@/components/ui';
import styles from './Header.module.css';

type Crumb = { label: string; href?: string };

const SEG_LABELS: Record<string, string> = {
  clients: 'Клиенты',
  projects: 'Проекты',
  catalog: 'Каталог',
  standards: 'Нормы',
  settings: 'Настройки',
  new: 'Новый',
  edit: 'Редактирование',
  systems: 'Системы',
  calc: 'Расчёт',
  import: 'Импорт',
};

function useCrumbs(): Crumb[] {
  const pathname = usePathname() ?? '/';
  return useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const crumbs: Crumb[] = [{ label: 'Дашборд', href: '/' }];
    let acc = '';
    parts.forEach((seg, idx) => {
      acc += '/' + seg;
      const isLast = idx === parts.length - 1;
      // id-сегменты cuid — показываем сокращённо
      const label = SEG_LABELS[seg] ?? (seg.length > 14 ? '…' : seg);
      crumbs.push({ label, href: isLast ? undefined : acc });
    });
    return crumbs;
  }, [pathname]);
}

export interface HeaderProps {
  userName: string;
  userRole: string;
}

export function Header({ userName, userRole }: HeaderProps) {
  const crumbs = useCrumbs();

  return (
    <header className={styles.header}>
      <div className={styles.crumbs}>
        {crumbs.map((c, idx) => (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {idx > 0 && <span className={styles.crumbSeparator}>/</span>}
            {c.href ? (
              <Link href={c.href} className={styles.crumbLink}>
                {c.label}
              </Link>
            ) : (
              <span className={styles.crumbCurrent}>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className={styles.right}>
        <div className={styles.userBox}>
          <Avatar name={userName} size="sm" />
          <div className={styles.userText}>
            <span className={styles.userName}>{userName}</span>
            <span className={styles.userRole}>{userRole}</span>
          </div>
        </div>
        <IconButton
          bordered
          title="Выйти"
          aria-label="Выйти"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </IconButton>
      </div>
    </header>
  );
}
