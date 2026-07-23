'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge } from '@/components/ui';
import { DynamicForm } from '@/components/schema/DynamicForm';
import { FieldList } from '@/components/admin/SchemaEditor';
import type { FieldSpec } from '@/lib/schema/types';
import {
  saveSpecSchema, clearSpecSchema, proposeSpecSchema, type ActionResult,
} from '@/server/actions/calc-types';

/**
 * Редактор СХЕМЫ СПЕЦИФИКАЦИИ (состав оборудования) — по аналогии со схемой ввода
 * (переиспользует тот же FieldList, предпросмотр DynamicForm и ИИ-помощник).
 * Хранение плоское (SystemType.specSchema, без версий) → правка сразу активна.
 */
export function SpecSchemaEditor({ code, name, working }: { code: string; name: string; working: FieldSpec[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldSpec[]>(working);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [showPreview, setShowPreview] = useState(false);

  const update = (f: FieldSpec[]) => { setFields(f); setDirty(true); };

  async function run(fn: () => Promise<ActionResult>, after?: () => void): Promise<void> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    after?.();
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        Спецификация — состав оборудования (группы позиций), который заполняет подбор.{' '}
        Тип: <strong>{name}</strong>{' '}
        {dirty && <Badge variant="info">несохранённые правки</Badge>}
        {' · '}{fields.length} групп
      </p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button disabled={busy || !dirty} onClick={() => run(() => saveSpecSchema(code, fields), () => setDirty(false))}>
          Сохранить
        </Button>
        <Button variant="ghost" disabled={busy || fields.length === 0}
          onClick={() => { if (confirm('Очистить схему спецификации?')) run(() => clearSpecSchema(code), () => { setFields([]); setDirty(false); }); }}>
          Очистить
        </Button>
        <Button variant="ghost" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}
        </Button>
      </div>

      <SpecAssistant code={code} fields={fields} onApply={update} />

      <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(0,1.4fr) minmax(0,1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Позиции спецификации" subtitle="Верхний уровень — разделы (группы); внутри — позиции состава">
          <FieldList fields={fields} onChange={update} depth={0} />
        </Card>
        {showPreview && (
          <Card title="Предпросмотр" subtitle="Так спецификацию увидит инженер при заполнении">
            <DynamicForm fields={fields} value={preview} onChange={setPreview} />
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── ИИ-помощник спецификации (тот же паттерн, что у схемы ввода) ────────────

function SpecAssistant({ code, fields, onApply }: {
  code: string;
  fields: FieldSpec[];
  onApply: (f: FieldSpec[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<FieldSpec[] | null>(null);

  async function propose() {
    setBusy(true); setError(null); setProposal(null);
    const r = await proposeSpecSchema(code, instruction, fields);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setProposal(r.fields);
  }

  return (
    <Card>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong style={{ flex: 1 }}>ИИ-помощник спецификации</strong>
        <span style={{ fontSize: 13, color: 'var(--text-muted,#667)' }}>опишите позиции словами — ИИ соберёт</span>
        <span style={{ color: '#889' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, borderTop: '1px solid var(--line,#eef)', paddingTop: 14 }}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={'Напр.: «Добавь группу „Пенное оборудование“ с позициями дозатор и бак-смеситель. В насосной группе добавь позицию „Расходомер“.»'}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line,#dde)', font: 'inherit', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button size="sm" disabled={busy || !instruction.trim()} onClick={propose}>
              {busy ? 'ИИ думает…' : proposal ? 'Предложить заново' : 'Предложить позиции'}
            </Button>
            <span style={{ fontSize: 12.5, color: 'var(--text-faint,#8b98a5)' }}>Применённое можно поправить руками; в БД пишется только по «Сохранить».</span>
          </div>

          {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 13 }}>{error}</div>}

          {proposal && (
            <div style={{ border: '1px solid color-mix(in srgb, var(--hydro,#1668a8) 30%, var(--line,#dde))', borderRadius: 8, padding: '12px 14px', background: 'color-mix(in srgb, var(--hydro,#1668a8) 5%, var(--surface,#fff))' }}>
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>ИИ предложил {proposal.length} групп</strong>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {proposal.map((f) => (
                  <span key={f.key} style={{ fontSize: 12, borderRadius: 999, padding: '2px 10px', background: 'var(--surface-2,#f6f8fa)', border: '1px solid var(--line,#dde)' }}>
                    {f.label || f.key}{f.fields?.length ? ` · ${f.fields.length} поз.` : ''}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => { onApply(proposal); setProposal(null); setInstruction(''); }}>Применить в редактор</Button>
                <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>Отклонить</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
