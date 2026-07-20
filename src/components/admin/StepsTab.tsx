'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { STEP_FILES } from '@/lib/pipeline/step-files';

/**
 * Список шагов типа = шаги конвейера. Клик по шагу → редактор его скила.
 * Скилы шагов общие (скил `${skillName}`); специфика типа — в модуле типа.
 */
export function StepsTab({ code, skillName, typeModule }: { code: string; skillName: string; typeModule: string | null }) {
  const router = useRouter();
  const base = `/admin/types/${code}/steps`;

  const row = (key: string, label: string, hint: string, sub: string) => (
    <button key={key} onClick={() => router.push(`${base}/${key}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border,#e3e6ea)',
        background: 'var(--surface,#fff)', cursor: 'pointer', font: 'inherit',
      }}>
      <span style={{
        flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
        background: 'color-mix(in srgb, var(--hydro,#1668a8) 12%, transparent)', color: 'var(--hydro,#1668a8)',
        fontWeight: 700, fontFamily: 'var(--font-mono,monospace)', fontSize: 13,
      }}>{label.split(' · ')[0]}</span>
      <span style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, display: 'block' }}>{label.split(' · ')[1] ?? label}</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted,#667)' }}>{hint}</span>
      </span>
      <code style={{ fontSize: 11.5, color: '#889', fontFamily: 'var(--font-mono,monospace)' }}>{sub}</code>
      <span style={{ color: '#bbb' }}>→</span>
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        Шаги расчётного конвейера. Открой шаг → редактируй его скил (текст методики + ИИ-помощник).
        Шаги общие для типов на скиле <code style={{ fontFamily: 'var(--font-mono,monospace)' }}>{skillName}</code>; специфику типа держит модуль типа.
      </p>

      <Card title="Шаги конвейера" subtitle="Каждый шаг = скил (файл методики)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEP_FILES.map((s) => row(s.key, s.label, s.hint, s.file))}
        </div>
      </Card>

      {typeModule && (
        <Card title="Модуль типа" subtitle="Специфика этого типа поверх общих шагов">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {row('module', 'Тип · Модуль типа', 'Идентификация, нормы, опросный лист, особенности подбора/оформления', typeModule)}
          </div>
        </Card>
      )}
    </div>
  );
}
