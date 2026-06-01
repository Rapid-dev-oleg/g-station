'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  IconBook,
  IconBuilding,
  IconFolder,
  IconHome,
  IconPackage,
  IconSettings,
  IconSparkles,
} from '@/components/ui';
import styles from './Sidebar.module.css';

const NAV = [
  { href: '/', label: 'Дашборд', icon: <IconHome /> },
  { href: '/intake', label: 'Новый расчёт из ТЗ', icon: <IconSparkles /> },
  { href: '/clients', label: 'Клиенты', icon: <IconBuilding /> },
  { href: '/projects', label: 'Проекты', icon: <IconFolder /> },
  { href: '/catalog', label: 'Каталог', icon: <IconPackage /> },
  { href: '/standards', label: 'Нормы', icon: <IconBook /> },
  { href: '/methodology', label: 'Методика', icon: <IconBook /> },
];

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="Гидрострой-НН"
          style={{ width: '100%', height: 'auto', maxHeight: 44 }}
        />
      </div>
      <nav className={styles.nav}>
        <div className={styles.navGroup}>Рабочий стол</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(styles.link, isActive(item.href) && styles.linkActive)}
          >
            <span className={styles.linkIcon}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div className={styles.navGroup}>Система</div>
        <Link
          href="/settings"
          className={clsx(styles.link, pathname.startsWith('/settings') && styles.linkActive)}
        >
          <span className={styles.linkIcon}>
            <IconSettings />
          </span>
          Настройки
        </Link>
      </nav>
      <div className={styles.footer}>
        <div>ООО «Гидрострой-НН»</div>
        <div className={styles.version}>Расчёт ПНС · v0.1.0</div>
      </div>
    </aside>
  );
}
