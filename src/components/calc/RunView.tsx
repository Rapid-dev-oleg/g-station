'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, Button } from '@/components/ui';
import { getRun, continuePipeline, applyStepEdit, applyStepForm, type RunView as Run } from '@/server/actions/pipeline';
import { CardRenderer } from '@/components/calc/CardRenderer';
import { DynamicForm } from '@/components/schema/DynamicForm';

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
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [formDrafts, setFormDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});

  const steps = run.steps;
  const total = steps.length;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const nextIdx = steps.findIndex((s) => s.status === 'pending');
  const hasError = run.status === 'error' || steps.some((s) => s.status === 'error');
  const allDone = total > 0 && doneCount === total;
  const running = run.status === 'running' && !hasError; // фон исполняет один шаг
  const paused = !allDone && !hasError && !running; // ждёт «Далее» инженера
  const runningKey = running && nextIdx !== -1 ? steps[nextIdx].key : null;
  const lastDoneKey = doneCount > 0 ? steps.filter((s) => s.status === 'done').slice(-1)[0].key : null;

  // Поллим, пока фон исполняет шаг ИЛИ пока после последнего шага считается сводка.
  const pollActive = running || (allDone && !run.summary);
  useEffect(() => {
    if (!pollActive) return;
    let alive = true;
    const t = setInterval(async () => {
      const fresh = await getRun(run.id);
      if (alive && fresh) setRun(fresh);
    }, 3500);
    return () => { alive = false; clearInterval(t); };
  }, [pollActive, run.id]);

  useEffect(() => { if (allDone) setOpenKey('output'); else if (lastDoneKey) setOpenKey(lastDoneKey); }, [allDone, lastDoneKey]);

  const refresh = async () => { const f = await getRun(run.id); if (f) setRun(f); };

  async function next() {
    setBusy(true);
    const r = await continuePipeline(run.id);
    setBusy(false);
    if (r.ok) { setRun({ ...run, status: 'running' }); }
  }
  async function saveEdit(key: string) {
    setBusy(true);
    const r = await applyStepEdit(run.id, key, editText);
    setBusy(false);
    if (r.ok) { setEditKey(null); await refresh(); }
  }
  async function saveForm(key: string, data: Record<string, unknown>) {
    setBusy(true);
    const r = await applyStepForm(run.id, key, data);
    setBusy(false);
    if (r.ok) await refresh();
  }
  const draftFor = (s: Step): Record<string, unknown> =>
    formDrafts[s.key] ?? (s.data as Record<string, unknown> | null) ?? {};

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

      {/* Баннер состояния (пошаговый управляемый режим) */}
      {running ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'color-mix(in srgb, var(--hydro,#1668a8) 8%, var(--surface,#fff))', border: '1px solid color-mix(in srgb, var(--hydro,#1668a8) 26%, var(--border,#dfe6ec))' }}>
          <Spinner dark />
          <span>Идёт <b>шаг {doneCount + 1} из {total}{runningKey ? `: ${steps[nextIdx].label.replace(/^\d+ · /, '')}` : ''}</b>… Можно закрыть страницу — вернётесь к результату.</span>
        </div>
      ) : hasError ? (
        <div style={{ borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'rgba(200,60,50,.1)', color: '#c33', border: '1px solid rgba(200,60,50,.3)' }}>
          Шаг завершился ошибкой (часто таймаут на длинном шаге). Запустите новый расчёт.
        </div>
      ) : paused ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 12, padding: '13px 16px', fontSize: 13.5, background: 'color-mix(in srgb, var(--gate,#b7791f) 9%, var(--surface,#fff))', border: '1px solid color-mix(in srgb, var(--gate,#b7791f) 30%, var(--border,#dfe6ec))' }}>
          <span style={{ flex: 1, minWidth: 240 }}>◆ <b>Шаг {doneCount} из {total} готов.</b> Проверьте вывод; при необходимости поправьте — правка учтётся на следующем шаге. Затем «Далее».</span>
          {nextIdx !== -1 && (
            <Button disabled={busy} onClick={next}>
              {busy ? 'Запускаю…' : `Далее: шаг ${doneCount + 1} — ${steps[nextIdx].label.replace(/^\d+ · /, '')}`}
            </Button>
          )}
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

      {/* Шаги — каждый показывает РЕДАКТИРУЕМУЮ ФОРМУ; ответ LLM — в раскрывашке */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s) => {
          const open = openKey === s.key;
          const editing = editKey === s.key;
          const hasForm = !!s.form && s.status === 'done';
          const badge = s.status === 'done' ? <Badge variant="success" withDot>готово</Badge>
            : s.key === runningKey ? <Badge variant="info" withDot>идёт…</Badge>
            : s.status === 'error' ? <Badge variant="danger" withDot>ошибка</Badge>
            : <Badge variant="default">ждёт</Badge>;
          return (
            <Card key={s.key}>
              <button onClick={() => setOpenKey(open ? null : s.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <strong style={{ flex: 1 }}>{s.label}</strong>
                {s.edited && <Badge variant="warning">правка инженера</Badge>}
                {badge}
                {(s.output || hasForm) && <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>}
              </button>

              {open && hasForm && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {!s.data && (
                    <div style={{ fontSize: 12.5, color: 'var(--gate,#b7791f)' }}>
                      ⚠ Агент не вернул структуру для формы — заполните вручную или смотрите ответ ниже.
                    </div>
                  )}
                  <DynamicForm
                    fields={s.form!}
                    value={draftFor(s)}
                    onChange={(v) => setFormDrafts((d) => ({ ...d, [s.key]: v }))}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button size="sm" disabled={busy || running} onClick={() => saveForm(s.key, draftFor(s))}>Сохранить форму</Button>
                    <span style={{ fontSize: 12, color: 'var(--text-faint,#8b98a5)' }}>Правка полей учтётся на следующем шаге (агент возьмёт её за истину).</span>
                  </div>
                  {s.output && (
                    <div>
                      <button onClick={() => setRawOpen((r) => ({ ...r, [s.key]: !r[s.key] }))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--hydro,#1668a8)', fontSize: 12.5, padding: 0 }}>
                        {rawOpen[s.key] ? '▾ Скрыть ответ агента (LLM)' : '▸ Ответ агента (LLM)'}
                      </button>
                      {rawOpen[s.key] && (
                        <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-muted,#556)', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '10px 12px', maxHeight: 360, overflow: 'auto' }}>{s.output}</pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Шаги без формы (fallback): текст + правка текстом */}
              {open && !hasForm && s.output && !editing && (
                <>
                  <pre style={{ margin: '12px 0 0', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text,#14202b)', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '12px 14px', maxHeight: 460, overflow: 'auto' }}>{s.output}</pre>
                  {s.status === 'done' && !running && (
                    <div style={{ marginTop: 8 }}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditKey(s.key); setEditText(s.output ?? ''); }}>✏ Править вывод</Button>
                    </div>
                  )}
                </>
              )}
              {open && !hasForm && editing && (
                <div style={{ marginTop: 12 }}>
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={12}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono,monospace)', fontSize: 12.5, lineHeight: 1.5, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line,#dde)', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <Button size="sm" disabled={busy} onClick={() => saveEdit(s.key)}>Сохранить правку</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditKey(null)}>Отмена</Button>
                  </div>
                </div>
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
