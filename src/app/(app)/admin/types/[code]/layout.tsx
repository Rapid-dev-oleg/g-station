import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCalcType } from '@/server/actions/calc-types';
import { TypeTabsNav } from '@/components/admin/TypeTabsNav';

export const dynamic = 'force-dynamic';

/** Каркас страницы типа: шапка (имя) + табы Схема / Степы. */
export default async function TypeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getCalcType(code);
  if (!data) notFound();
  const { identity } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href="/admin/types" style={{ color: '#888', fontSize: 14 }}>← Типы расчёта</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <h1 style={{ margin: 0 }}>{identity.name}</h1>
          <code style={{ fontFamily: 'var(--font-mono,monospace)', color: '#889', fontSize: 14 }}>{identity.code}</code>
        </div>
      </div>
      <TypeTabsNav code={code} />
      <div>{children}</div>
    </div>
  );
}
