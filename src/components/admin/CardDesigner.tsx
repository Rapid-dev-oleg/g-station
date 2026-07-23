'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge } from '@/components/ui';
import { CardRenderer } from '@/components/calc/CardRenderer';
import {
  CARD_BLOCK_CATALOG, DEFAULT_CARD_LAYOUT, SAMPLE_SUMMARY, blockTitle,
  type CardLayout, type CardBlock, type CardBlockType,
} from '@/lib/card/layout';
import { saveCardLayout, resetCardLayout, proposeCardLayout } from '@/server/actions/card-design';

const CATALOG = Object.fromEntries(CARD_BLOCK_CATALOG.map((b) => [b.type, b]));
const linkBtn = { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--hydro,#1668a8)', fontSize: 13, padding: 0 } as const;

export function CardDesigner({ code, initial, customized }: {
  code: string;
  initial: CardLayout;
  customized: boolean;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<CardLayout>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState(customized);

  const set = (l: CardLayout) => { setLayout(l); setDirty(true); };
  const patch = (i: number, p: Partial<CardBlock>) => set(layout.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= layout.length) return;
    const copy = layout.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    set(copy);
  };
  const remove = (i: number) => set(layout.filter((_, j) => j !== i));
  const add = (type: CardBlockType) => set([...layout, { type }]);

  const present = new Set(layout.map((b) => b.type));
  const missing = CARD_BLOCK_CATALOG.filter((b) => !present.has(b.type));

  async function save() {
    setBusy(true); setError(null);
    const r = await saveCardLayout(code, layout);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setDirty(false); setCustom(true); router.refresh();
  }
  async function reset() {
    setBusy(true); setError(null);
    const r = await resetCardLayout(code);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setLayout(DEFAULT_CARD_LAYOUT); setDirty(false); setCustom(false); router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        Дизайн итоговой карточки расчёта — какие блоки, в каком порядке, под какими подписями.{' '}
        {custom ? <Badge variant="info">свой дизайн</Badge> : <Badge variant="default">по умолчанию</Badge>}{' '}
        {dirty && <Badge variant="warning">несохранённые правки</Badge>}
      </p>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button disabled={busy || !dirty} onClick={save}>Сохранить</Button>
        <Button variant="ghost" disabled={busy || (!custom && !dirty)} onClick={reset}>Сбросить к дефолту</Button>
      </div>

      <CardAssistant code={code} layout={layout} onApply={set} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 16, alignItems: 'start' }}>
        {/* Конструктор блоков */}
        <Card title="Блоки карточки" subtitle="Порядок сверху вниз = порядок в карточке">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {layout.map((b, i) => {
              const cat = CATALOG[b.type];
              return (
                <div key={b.type} style={{ border: '1px solid var(--line,#dde)', borderRadius: 8, padding: '10px 12px', background: b.hidden ? 'var(--surface-2,#f6f8fa)' : 'var(--surface,#fff)', opacity: b.hidden ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ flex: 1 }}>{blockTitle(b)}</strong>
                    <button onClick={() => move(i, -1)} disabled={i === 0} title="Выше" style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === layout.length - 1} title="Ниже" style={{ border: 'none', background: 'none', cursor: i === layout.length - 1 ? 'default' : 'pointer', opacity: i === layout.length - 1 ? 0.3 : 1 }}>▼</button>
                    <button style={linkBtn} onClick={() => patch(i, { hidden: !b.hidden })}>{b.hidden ? 'показать' : 'скрыть'}</button>
                    <button style={{ ...linkBtn, color: '#c33' }} onClick={() => remove(i)}>убрать</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint,#8b98a5)', marginTop: 3 }}>{cat?.description}</div>
                  {b.type !== 'header' && (
                    <input
                      value={b.title ?? ''}
                      placeholder={`Подпись (по умолчанию «${cat?.label ?? b.type}»)`}
                      onChange={(e) => patch(i, { title: e.target.value || undefined })}
                      style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line,#dde)', font: 'inherit', fontSize: 13 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {missing.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: '#889', marginBottom: 6 }}>Добавить блок:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map((b) => (
                  <Button key={b.type} size="sm" variant="secondary" onClick={() => add(b.type)}>+ {b.label}</Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Живой предпросмотр на примере */}
        <Card title="Предпросмотр" subtitle="На примере расчёта — так увидит инженер">
          <CardRenderer layout={layout} s={SAMPLE_SUMMARY} />
        </Card>
      </div>
    </div>
  );
}

// ─── ИИ-помощник дизайна ────────────────────────────────────────────────────

function CardAssistant({ code, layout, onApply }: {
  code: string;
  layout: CardLayout;
  onApply: (l: CardLayout) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CardLayout | null>(null);

  async function propose() {
    setBusy(true); setError(null); setProposal(null);
    const r = await proposeCardLayout(code, instruction, layout);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setProposal(r.layout);
  }

  return (
    <Card>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong style={{ flex: 1 }}>ИИ-помощник дизайна</strong>
        <span style={{ fontSize: 13, color: 'var(--text-muted,#667)' }}>опишите словами — ИИ переставит блоки</span>
        <span style={{ color: '#889' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, borderTop: '1px solid var(--line,#eef)', paddingTop: 14 }}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={'Напр.: «Смету подними наверх, сразу после шифра. Скрой блок гейтов. Состав переименуй в «Спецификация».»'}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line,#dde)', font: 'inherit', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button size="sm" disabled={busy || !instruction.trim()} onClick={propose}>
              {busy ? 'ИИ думает…' : proposal ? 'Предложить заново' : 'Предложить дизайн'}
            </Button>
            <span style={{ fontSize: 12.5, color: 'var(--text-faint,#8b98a5)' }}>Применённое можно поправить руками; в БД пишется только по «Сохранить».</span>
          </div>

          {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 13 }}>{error}</div>}

          {proposal && (
            <div style={{ border: '1px solid color-mix(in srgb, var(--hydro,#1668a8) 30%, var(--line,#dde))', borderRadius: 8, padding: '12px 14px', background: 'color-mix(in srgb, var(--hydro,#1668a8) 5%, var(--surface,#fff))' }}>
              <strong style={{ fontSize: 14 }}>ИИ предложил порядок:</strong>
              <ol style={{ margin: '8px 0 12px', paddingLeft: 20, fontSize: 13.5 }}>
                {proposal.map((b) => (
                  <li key={b.type} style={{ color: b.hidden ? 'var(--text-faint,#8b98a5)' : 'inherit', textDecoration: b.hidden ? 'line-through' : 'none', padding: '2px 0' }}>
                    {blockTitle(b)}{b.hidden && ' (скрыт)'}
                  </li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => { onApply(proposal); setProposal(null); setInstruction(''); }}>Применить</Button>
                <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>Отклонить</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
