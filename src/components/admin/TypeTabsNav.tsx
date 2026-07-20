'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui';

const TABS = [
  { key: 'schema', label: 'Схема', suffix: '/schema' },
  { key: 'steps', label: 'Степы', suffix: '/steps' },
] as const;

/** Таб-навигация страницы типа: Схема (ввод) + Степы (шаг-скилы). */
export function TypeTabsNav({ code }: { code: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/admin/types/${code}`;
  const active = pathname.startsWith(base + '/steps') ? 'steps' : 'schema';

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
