'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@/components/ui';
import { getRun, type RunView as Run } from '@/server/actions/pipeline';

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

      {/* Сводка результата — структурно (или шифр как fallback) */}
      {allDone && run.summary ? <SummaryView s={run.summary} />
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

type Summary = NonNullable<Run['summary']>;
const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('ru-RU') : '—');
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-faint,#8b98a5)', fontWeight: 600 };
const th: React.CSSProperties = { textAlign: 'left', ...eyebrow, padding: '8px 12px', borderBottom: '1px solid var(--border,#dfe6ec)' };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)', fontSize: 13.5, verticalAlign: 'top' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono,monospace)' };

function SummaryView({ s }: { s: Summary }) {
  const c = s.characteristics ?? {};
  const chips: [string, string | undefined][] = [
    ['Расход Q', c.Q], ['Напор H', c.H], ['Схема', c.scheme], ['Насос', c.pump], ['Мощность', c.power], ['Пуск', c.start],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* шифр + цена */}
      {(s.cipher || s.estimate?.client_price) && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '16px 20px' }}>
            {s.cipher && (
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ ...eyebrow, marginBottom: 6 }}>Шифр изделия</div>
                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontWeight: 640, fontSize: 17, color: 'var(--hydro,#1668a8)', wordBreak: 'break-all' }}>{s.cipher}</div>
              </div>
            )}
            {s.estimate?.client_price != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={eyebrow}>Цена клиенту</div>
                <div style={{ fontSize: 25, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.estimate.client_price)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted,#667)' }}>₽</span></div>
                {s.estimate.cost_total != null && <div style={{ fontSize: 12, color: 'var(--text-muted,#667)' }}>себестоимость {fmt(s.estimate.cost_total)} ₽</div>}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* характеристики */}
      {chips.some(([, v]) => v) && (
        <Card><div style={{ padding: '16px 20px' }}>
          <div style={{ ...eyebrow, marginBottom: 12 }}>Характеристики</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {chips.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ border: '1px solid var(--border,#dfe6ec)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface-2,#f6f8fa)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint,#8b98a5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 620, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
        </div></Card>
      )}

      {/* состав */}
      {s.equipment?.length ? (
        <Card>
          <div style={{ padding: '15px 20px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)', display: 'flex', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 14.5 }}>Состав оборудования</strong><span style={eyebrow}>{s.equipment.length} позиций</span>
          </div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><th style={th}>Позиция</th><th style={th}>Характеристика</th><th style={{ ...th, textAlign: 'right' }}>Кол-во</th></tr>
              {s.equipment.map((e, i) => (
                <tr key={i}><td style={{ ...td, fontWeight: 600 }}>{e.name}</td><td style={{ ...td, color: 'var(--text-muted,#556)' }}>{e.spec ?? '—'}</td><td style={tdNum}>{e.qty ?? '—'}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      ) : null}

      {/* смета */}
      {s.estimate?.rows?.length ? (
        <Card>
          <div style={{ padding: '15px 20px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)' }}><strong style={{ fontSize: 14.5 }}>Смета</strong></div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><th style={th}>Группа · позиция</th><th style={th}>Источник</th><th style={{ ...th, textAlign: 'right' }}>Закупка, ₽</th></tr>
              {s.estimate.rows.map((r, i) => (
                <tr key={i}><td style={td}>{r.item}</td><td style={td}>{r.source && <span style={{ fontSize: 10.5, borderRadius: 999, padding: '1px 7px', color: /бд|db/i.test(r.source) ? 'var(--ok,#1f9d63)' : 'var(--gate,#b7791f)', background: /бд|db/i.test(r.source) ? 'color-mix(in srgb,var(--ok,#1f9d63) 14%,transparent)' : 'color-mix(in srgb,var(--gate,#b7791f) 14%,transparent)' }}>{r.source}</span>}</td><td style={tdNum}>{fmt(r.cost)}</td></tr>
              ))}
              {s.estimate.cost_total != null && <tr style={{ fontWeight: 700 }}><td style={{ ...td, borderTop: '2px solid var(--border,#dfe6ec)' }}>Себестоимость</td><td style={{ ...td, borderTop: '2px solid var(--border,#dfe6ec)' }}></td><td style={{ ...tdNum, borderTop: '2px solid var(--border,#dfe6ec)' }}>{fmt(s.estimate.cost_total)}</td></tr>}
              {s.estimate.client_price != null && <tr style={{ fontWeight: 700 }}><td style={td}>Цена клиенту</td><td style={td}></td><td style={{ ...tdNum, color: 'var(--hydro,#1668a8)' }}>{fmt(s.estimate.client_price)}</td></tr>}
            </tbody>
          </table></div>
        </Card>
      ) : null}

      {/* гейты */}
      {s.gates?.length ? (
        <Card><div style={{ padding: '15px 20px' }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Требует подтверждения инженера</div>
          {s.gates.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13, padding: '6px 0', borderTop: i ? '1px solid var(--border-soft,#eef2f6)' : 'none' }}>
              <span style={{ color: 'var(--gate,#b7791f)' }}>◆</span><span>{g}</span>
            </div>
          ))}
        </div></Card>
      ) : null}
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
