'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge } from '@/components/ui';
import { runPipelineStep, type RunView as Run } from '@/server/actions/pipeline';

type Step = Run['steps'][number];

export function RunView({ run }: { run: Run }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(run.steps);
  const [running, setRunning] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(steps.find((s) => s.status === 'done' && s.key === 'output')?.key ?? null);
  const [showCard, setShowCard] = useState(false);

  const total = steps.length;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const allDone = doneCount === total;
  const hasError = steps.some((s) => s.status === 'error') || run.status === 'error';

  /** Прогнать все оставшиеся шаги подряд (в одной сессии). Пауза — по ошибке. */
  async function runAll() {
    await loop(false);
  }
  /** Один следующий шаг (для контроля / гейтов между шагами). */
  async function runOne() {
    await loop(true);
  }

  async function loop(single: boolean) {
    if (running) return;
    setRunning(true); setError(null);
    let local = [...steps];
    let guard = 0;
    try {
      while (local.some((s) => s.status === 'pending') && guard < 12) {
        guard++;
        const nx = local.find((s) => s.status === 'pending');
        setRunningKey(nx?.key ?? null);
        setOpenKey(nx?.key ?? null);
        const r = await runPipelineStep(run.id);
        if (!r.ok) { setError(r.error); break; }
        if (r.step) {
          local = local.map((s) => (s.key === r.step!.key ? (r.step as Step) : s));
          setSteps(local);
          setOpenKey(r.step.key);
        }
        if (r.done || single) break;
      }
    } finally {
      setRunningKey(null); setRunning(false); router.refresh();
    }
  }

  const nextLabel = steps.find((s) => s.status === 'pending')?.label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Прогресс-полоса */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
        {steps.map((s, i) => {
          const state = s.status === 'done' ? 'done' : s.key === runningKey ? 'run' : s.status === 'error' ? 'err' : 'wait';
          const color = state === 'done' ? 'var(--ok,#1f9d63)' : state === 'run' ? 'var(--hydro,#1668a8)' : state === 'err' ? '#c0392b' : 'var(--border,#dfe6ec)';
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < total - 1 ? 1 : '0 0 auto' }}>
              <button onClick={() => setOpenKey(openKey === s.key ? null : s.key)} title={s.label}
                style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: color, flex: 'none' }}>
                  {state === 'done' ? '✓' : state === 'run' ? <Spinner /> : state === 'err' ? '!' : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: state === 'wait' ? 'var(--text-faint,#8b98a5)' : 'var(--text,#14202b)', whiteSpace: 'nowrap' }}>{s.label.replace(/^\d+ · /, '')}</span>
              </button>
              {i < total - 1 && <span style={{ flex: 1, minWidth: 16, height: 2, background: s.status === 'done' ? 'var(--ok,#1f9d63)' : 'var(--border,#dfe6ec)', margin: '0 8px' }} />}
            </div>
          );
        })}
      </div>

      {/* Управление — одна понятная кнопка */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {allDone ? (
            <Badge variant="success" withDot>Расчёт готов — {total} шага пройдены</Badge>
          ) : hasError ? (
            <span style={{ color: '#c33', fontSize: 14 }}>Шаг завершился ошибкой — можно повторить.</span>
          ) : running ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Spinner dark /> Идёт: <b>{steps.find((s) => s.key === runningKey)?.label ?? '…'}</b> ({doneCount + 1} из {total})
            </span>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--text-muted,#667)' }}>
              {doneCount === 0 ? 'Готово к расчёту.' : `Пройдено ${doneCount} из ${total}. Продолжить?`}
            </span>
          )}

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {!allDone && (
              <Button disabled={running} onClick={hasError ? runOne : runAll}>
                {running ? 'Считаю…' : doneCount === 0 ? '▶ Рассчитать' : hasError ? 'Повторить шаг' : '▶ Продолжить'}
              </Button>
            )}
            {!allDone && !running && !hasError && doneCount < total && (
              <Button variant="ghost" disabled={running} onClick={runOne} title={`Выполнить только: ${nextLabel}`}>по одному шагу</Button>
            )}
          </div>
        </div>
        {running && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted,#667)', marginTop: 10 }}>
            Каждый шаг идёт в сессии агента (~1–2 мин), контекст предыдущих сохраняется. Можно не закрывать страницу.
          </div>
        )}
      </Card>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      {/* Шаги — сворачиваемые */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s) => {
          const open = openKey === s.key;
          const badge = s.status === 'done' ? <Badge variant="success" withDot>готово</Badge>
            : s.key === runningKey ? <Badge variant="info" withDot>идёт…</Badge>
            : s.status === 'error' ? <Badge variant="danger" withDot>ошибка</Badge>
            : <Badge variant="default">ждёт</Badge>;
          return (
            <Card key={s.key}>
              <button onClick={() => setOpenKey(open ? null : s.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <strong style={{ flex: 1 }}>{s.label}</strong>
                {badge}
                {s.output && <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>}
              </button>
              {open && s.output && (
                <pre style={{ margin: '12px 0 0', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text,#14202b)', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '12px 14px', maxHeight: 420, overflow: 'auto' }}>{s.output}</pre>
              )}
            </Card>
          );
        })}
      </div>

      {/* Низ: карточка входа + новый расчёт */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <button onClick={() => setShowCard((v) => !v)} style={{ border: 'none', background: 'none', color: 'var(--hydro,#1668a8)', cursor: 'pointer' }}>
          {showCard ? 'скрыть карточку входа' : 'карточка входа'}
        </button>
        <span style={{ color: '#889' }}>тип: <code style={{ fontFamily: 'var(--font-mono,monospace)' }}>{run.typeCode}</code></span>
        <Link href="/calc/new" style={{ color: 'var(--hydro,#1668a8)', marginLeft: 'auto' }}>← Новый расчёт</Link>
      </div>
      {showCard && <Card><pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono,monospace)', color: '#556' }}>{JSON.stringify(run.card, null, 2)}</pre></Card>}
    </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span style={{ display: 'inline-block', width: dark ? 14 : 13, height: dark ? 14 : 13, border: `2px solid ${dark ? 'color-mix(in srgb, var(--hydro,#1668a8) 30%, transparent)' : 'rgba(255,255,255,.4)'}`, borderTopColor: dark ? 'var(--hydro,#1668a8)' : '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @media (prefers-reduced-motion: reduce) { * { animation: none !important } }`}</style>
    </span>
  );
}
