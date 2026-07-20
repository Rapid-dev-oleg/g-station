'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge } from '@/components/ui';
import { runPipelineStep, type RunView as Run } from '@/server/actions/pipeline';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'default' | 'danger' }> = {
  running: { label: 'идёт', variant: 'info' },
  paused: { label: 'пауза', variant: 'warning' },
  done: { label: 'завершён', variant: 'success' },
  error: { label: 'ошибка', variant: 'danger' },
};

export function RunView({ run }: { run: Run }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);

  const steps = run.steps;
  const nextIdx = steps.findIndex((s) => s.status === 'pending');
  const done = nextIdx === -1;

  async function runStep() {
    setBusy(true); setError(null);
    const r = await runPipelineStep(run.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); router.refresh(); return; }
    router.refresh();
  }

  const st = STATUS[run.status] ?? STATUS.running;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Badge variant={st.variant} withDot>{st.label}</Badge>
        <span style={{ fontSize: 13, color: 'var(--text-muted,#667)' }}>тип: <code style={{ fontFamily: 'var(--font-mono,monospace)' }}>{run.typeCode}</code></span>
        <button onClick={() => setShowCard((v) => !v)} style={{ border: 'none', background: 'none', color: 'var(--hydro,#1668a8)', cursor: 'pointer', fontSize: 13 }}>
          {showCard ? 'скрыть карточку' : 'показать карточку входа'}
        </button>
      </div>

      {showCard && (
        <Card><pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono,monospace)', color: '#556' }}>{JSON.stringify(run.card, null, 2)}</pre></Card>
      )}

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      {/* Шаги */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          const dotColor = s.status === 'done' ? 'var(--ok,#1f9d63)' : s.status === 'error' ? '#c0392b' : isNext ? 'var(--hydro,#1668a8)' : 'var(--border,#dfe6ec)';
          return (
            <Card key={s.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: dotColor, flex: 'none' }}>{i + 1}</span>
                <strong style={{ flex: 1 }}>{s.label}</strong>
                {s.status === 'done' && <Badge variant="success" withDot>готово</Badge>}
                {s.status === 'error' && <Badge variant="danger" withDot>ошибка</Badge>}
                {s.status === 'pending' && <Badge variant="default">{isNext ? 'следующий' : 'ждёт'}</Badge>}
              </div>
              {s.output && (
                <pre style={{ margin: '12px 0 0', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text,#14202b)', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '12px 14px', maxHeight: 360, overflow: 'auto' }}>{s.output}</pre>
              )}
            </Card>
          );
        })}
      </div>

      {/* Управление */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!done && run.status !== 'error' && (
          <Button disabled={busy} onClick={runStep}>
            {busy ? `Выполняется: ${steps[nextIdx]?.label}…` : `Выполнить шаг: ${steps[nextIdx]?.label}`}
          </Button>
        )}
        {done && <Badge variant="success" withDot>Расчёт завершён — все шаги пройдены</Badge>}
        {run.status === 'error' && <span style={{ fontSize: 13, color: '#c33' }}>Шаг завершился ошибкой. Запустите новый расчёт.</span>}
        <Link href="/calc/new" style={{ color: 'var(--hydro,#1668a8)', fontSize: 13, marginLeft: 'auto' }}>← Новый расчёт</Link>
      </div>

      {busy && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted,#667)' }}>
          Шаг идёт в сессии агента (~минута-две), контекст предыдущих шагов сохраняется. Можно не закрывать страницу.
        </div>
      )}
    </div>
  );
}
