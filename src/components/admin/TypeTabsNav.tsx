'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui';

const TABS = [
  { key: 'overview', label: 'Обзор', suffix: '' },
  { key: 'schema', label: 'Схема', suffix: '/schema' },
  { key: 'instructions', label: 'Инструкции', suffix: '/instructions' },
  { key: 'norms', label: 'Нормативы', suffix: '/norms' },
] as const;

/** Таб-навигация страницы типа: переключает под-роуты, активный — по pathname. */
export function TypeTabsNav({ code }: { code: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/admin/types/${code}`;
  const active =
    pathname === base || pathname === `${base}/`
      ? 'overview'
      : TABS.find((t) => t.suffix && pathname.startsWith(base + t.suffix))?.key ?? 'overview';

  return (
    <Tabs
      tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
      active={active}
      onChange={(key) => {
        const t = TABS.find((x) => x.key === key);
        if (t) router.push(base + t.suffix);
      }}
    />
  );
}
