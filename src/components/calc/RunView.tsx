'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@/components/ui';
import { getRun, type RunView as Run } from '@/server/actions/pipeline';
import { CardRenderer } from '@/components/calc/CardRenderer';

type Step = Run['steps'][number];

/** Извлечь шифр изделия из вывода шага «Выход» (для сводки). */
function extractCipher(steps: Step[]): string | null {
  const out = steps.find((s) => s.key === 'output')?.output ?? '';
  const m = out.match(/G-?Fire\s+GF-[^\n|`*]+/i) || out.match(/GF-[A-Za-zА-Яа-я0-9()/,.\-]+/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export function RunView({ run: initial }: { run: Run }) {
  const [run, setRun] = useState<Run>(initial);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const steps = run.steps;
  const total = steps.length;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const nextIdx = steps.findIndex((s) => s.status === 'pending');
  const hasError = run.status === 'error' || steps.some((s) => s.status === 'error');
  const allDone = total > 0 && doneCount === total;
  const active = !allDone && !hasError; // задача в фоне гонит шаги
  const runningKey = active && nextIdx !== -1 ? steps[nextIdx].key : null;

  // Поллим прогресс, пока идёт (фоновая задача обновляет PipelineRun).
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const t = setInterval(async () => {
      const fresh = await getRun(run.id);
      if (alive && fresh) setRun(fresh);
    }, 3500);
    return () => { alive = false; clearInterval(t); };
  }, [active, run.id]);

  useEffect(() => { if (allDone) setOpenKey('output'); }, [allDone]);

  const cipher = allDone ? extractCipher(steps) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Прогресс-полоса */}
      <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', background: 'var(--surface,#fff)', border: '1px solid var(--border,#dfe6ec)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--shadow, 0 1px 2px rgba(20,32,43,.04))' }}>
        {steps.map((s, i) => {
          const state = s.status === 'done' ? 'done' : s.key === runningKey ? 'run' : s.status === 'error' ? 'err' : 'wait';
          const bg = state === 'done' ? 'var(--ok,#1f9d63)' : state === 'run' ? 'var(--hydro,#1668a8)' : state === 'err' ? '#c0392b' : 'var(--border,#dfe6ec)';
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < total - 1 ? 1 : '0 0 auto' }}>
              <button onClick={() => setOpenKey(openKey === s.key ? null : s.key)} style={{ display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: bg, flex: 'none' }}>
                  {state === 'done' ? '✓' : state === 'run' ? <Spinner /> : state === 'err' ? '!' : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: state === 'wait' ? 'var(--text-faint,#8b98a5)' : 'var(--text,#14202b)', whiteSpace: 'nowrap' }}>{s.label.replace(/^\d+ · /, '')}</span>
              </button>
              {i < total - 1 && <span style={{ flex: 1, minWidth: 16, height: 2, background: s.status === 'done' ? 'var(--ok,#1f9d63)' : 'var(--border,#dfe6ec)', margin: '0 8px' }} />}
            </div>
          );
        })}
      </div>

      {/* Баннер состояния */}
      {active ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'color-mix(in srgb, var(--hydro,#1668a8) 8%, var(--surface,#fff))', border: '1px solid color-mix(in srgb, var(--hydro,#1668a8) 26%, var(--border,#dfe6ec))' }}>
          <Spinner dark />
          <span>Считается в фоне — <b>шаг {doneCount + 1} из {total}{runningKey ? `: ${steps[nextIdx].label.replace(/^\d+ · /, '')}` : ''}</b>. Можно закрыть страницу — расчёт идёт на сервере, вернётесь к готовому.</span>
        </div>
      ) : hasError ? (
        <div style={{ borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'rgba(200,60,50,.1)', color: '#c33', border: '1px solid rgba(200,60,50,.3)' }}>
          Шаг завершился ошибкой (часто таймаут на длинном шаге). Запустите новый расчёт.
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'color-mix(in srgb, var(--ok,#1f9d63) 10%, var(--surface,#fff))', border: '1px solid color-mix(in srgb, var(--ok,#1f9d63) 30%, var(--border,#dfe6ec))' }}>
          ✓ <span><b>Расчёт готов.</b> Черновик для инженера — проверьте, затем в ТКП.</span>
        </div>
      )}

      {/* Сводка результата — по дизайну карточки типа (или шифр как fallback) */}
      {allDone && run.summary ? <CardRenderer layout={run.cardLayout} s={run.summary} />
        : allDone && cipher ? (
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-faint,#8b98a5)', fontWeight: 600, marginBottom: 6 }}>Шифр изделия</div>
              <div style={{ fontFamily: 'var(--font-mono,monospace)', fontWeight: 640, fontSize: 17, color: 'var(--hydro,#1668a8)', wordBreak: 'break-all' }}>{cipher}</div>
            </div>
          </Card>
        ) : null}

      {/* Шаги — сворачиваемые (детали агента) */}
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
                <pre style={{ margin: '12px 0 0', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text,#14202b)', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '12px 14px', maxHeight: 460, overflow: 'auto' }}>{s.output}</pre>
              )}
            </Card>
          );
        })}
      </div>

      {/* Низ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <span style={{ color: '#889' }}>тип: <code style={{ fontFamily: 'var(--font-mono,monospace)' }}>{run.typeCode}</code></span>
        <Link href="/calc/new" style={{ color: 'var(--hydro,#1668a8)', marginLeft: 'auto' }}>← Новый расчёт</Link>
      </div>
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
