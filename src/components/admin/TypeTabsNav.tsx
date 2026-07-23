'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui';

const TABS = [
  { key: 'schema', label: 'Схема ввода', suffix: '/schema' },
  { key: 'spec', label: 'Спецификация', suffix: '/spec' },
  { key: 'steps', label: 'Шаги', suffix: '/steps' },
  { key: 'card', label: 'Карточка', suffix: '/card' },
] as const;

/** Таб-навигация типа: Схема ввода · Спецификация · Шаги · Карточка. */
export function TypeTabsNav({ code }: { code: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/admin/types/${code}`;
  const active = pathname.startsWith(base + '/spec') ? 'spec'
    : pathname.startsWith(base + '/steps') ? 'steps'
    : pathname.startsWith(base + '/card') ? 'card'
    : 'schema';

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
