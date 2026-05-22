'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { IconBook, IconBuilding, IconFolder, IconHome, IconLogo, IconPackage, IconSettings } from '../ui';
import styles from './Sidebar.module.css';

const NAV = [
  { href: '/', label: 'Главная', icon: <IconHome /> },
  { href: '/clients', label: 'Клиенты', icon: <IconBuilding /> },
  { href: '/projects', label: 'Проекты', icon: <IconFolder /> },
  { href: '/catalog', label: 'Каталог', icon: <IconPackage /> },
  { href: '/standards', label: 'Справочник', icon: <IconBook /> },
];

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <IconLogo />
        <div className={styles.brandText}>
          <span className={styles.brandTitle}>Гидрострой-НН</span>
          <span className={styles.brandSubtitle}>Конфигуратор</span>
        </div>
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
          href="/settings/company"
          className={clsx(styles.link, pathname.startsWith('/settings') && styles.linkActive)}
        >
          <span className={styles.linkIcon}><IconSettings /></span>
          Настройки
        </Link>
      </nav>
      <div className={styles.footer}>
        <div>ООО «Гидрострой-НН»</div>
        <div className={styles.version}>MVP demo · v0.1.0</div>
      </div>
    </aside>
  );
}
