'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Avatar, Badge, IconSearch, IconSparkles } from '../ui';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import styles from './Header.module.css';

type Crumb = { label: string; href?: string };

function useCrumbs(): Crumb[] {
  const pathname = usePathname() ?? '/';
  const clients = useClientsStore((s) => s.clients);
  const projects = useProjectsStore((s) => s.projects);

  return useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const crumbs: Crumb[] = [{ label: 'Главная', href: '/' }];
    if (parts.length === 0) return crumbs;

    let acc = '';
    parts.forEach((seg, idx) => {
      acc += '/' + seg;
      const isLast = idx === parts.length - 1;
      let label: string = seg;
      if (seg === 'clients') label = 'Клиенты';
      else if (seg === 'projects') label = 'Проекты';
      else if (seg === 'catalog') label = 'Каталог';
      else if (seg === 'standards') label = 'Справочник';
      else if (seg === 'settings') label = 'Настройки';
      else if (seg === 'company') label = 'Компания';
      else if (seg === 'new') label = 'Новый';
      else if (seg === 'edit') label = 'Редактирование';
      else if (seg === 'systems') label = 'Системы';
      else if (seg === 'proposal') label = 'ТКП';
      else if (seg.startsWith('cli-')) {
        const c = clients.find((x) => x.id === seg);
        label = c?.shortName ?? seg;
      } else if (seg.startsWith('proj-')) {
        const p = projects.find((x) => x.id === seg);
        label = p?.name ?? seg;
      } else if (seg.startsWith('sys-')) {
        let sysName: string | undefined;
        for (const p of projects) {
          const s = p.systems.find((x) => x.id === seg);
          if (s) { sysName = s.name; break; }
        }
        label = sysName ?? seg;
      }
      crumbs.push({ label, href: isLast ? undefined : acc });
    });
    return crumbs;
  }, [pathname, clients, projects]);
}

export function Header() {
  const crumbs = useCrumbs();
  const aiMode = (process.env.NEXT_PUBLIC_AI_MODE ?? 'mock') as 'mock' | 'live';
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
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IconSearch /></span>
          <input className={styles.searchInput} type="text" placeholder="Поиск..." />
        </div>
        <Badge variant={aiMode === 'live' ? 'success' : 'info'} withDot>
          <IconSparkles width={12} height={12} style={{ marginRight: 4 }} />
          AI: {aiMode}
        </Badge>
        <div className={styles.userBox}>
          <Avatar name="Менеджер Г." size="sm" />
          <div className={styles.userText}>
            <span className={styles.userName}>Менеджер</span>
            <span className={styles.userRole}>отдел продаж</span>
          </div>
        </div>
      </div>
    </header>
  );
}
