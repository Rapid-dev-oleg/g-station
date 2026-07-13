'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge, Input, Select, Textarea } from '@/components/ui';
import { DynamicForm } from '@/components/schema/DynamicForm';
import type { FieldSpec, FieldDataType } from '@/lib/schema/types';
import {
  saveDraftSchema, publishSchema, discardDraft, type ActionResult,
} from '@/server/actions/calc-types';

const TYPE_OPTS = [
  { value: 'measured', label: 'Число + единица (measured)' },
  { value: 'number', label: 'Число' },
  { value: 'enum', label: 'Выбор из вариантов (enum)' },
  { value: 'boolean', label: 'Да / Нет' },
  { value: 'text', label: 'Текст' },
  { value: 'textarea', label: 'Текст многострочный' },
  { value: 'group', label: 'Группа (вложенные поля)' },
  { value: 'array', label: 'Список (повторяемые поля)' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTS.map((o) => [o.value, o.label.split(' (')[0]]));

const optsToText = (opts?: { value: string; label: string }[]) =>
  (opts ?? []).map((o) => (o.value === o.label ? o.value : `${o.value} | ${o.label}`)).join('\n');
const textToOpts = (t: string) =>
  t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [v, lab] = l.split('|').map((s) => s.trim());
    return { value: v, label: lab || v };
  });
const parseVal = (s: string): string | number | boolean =>
  s === 'true' ? true : s === 'false' ? false : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;

// ─── Одно поле ─────────────────────────────────────────────────────────────

function FieldRow({ field, onChange, onDelete, onUp, onDown, canUp, canDown, depth }: {
  field: FieldSpec;
  onChange: (f: FieldSpec) => void;
  onDelete: () => void;
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<FieldSpec>) => onChange({ ...field, ...patch });
  const isGroup = field.dataType === 'group' || field.dataType === 'array';

  return (
    <div style={{ border: '1px solid var(--line,#dde)', borderRadius: 8, background: 'var(--surface,#fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#889' }}>{open ? '▾' : '▸'}</span>
          <strong>{field.label || '(без подписи)'}</strong>
          <span style={{ fontFamily: 'monospace', color: '#889', fontSize: 12 }}>{field.key}</span>
          <Badge variant="info">{TYPE_LABEL[field.dataType] ?? field.dataType}</Badge>
          {field.required && <Badge variant="warning">обяз.</Badge>}
        </button>
        <button onClick={onUp} disabled={!canUp} title="Выше" style={{ border: 'none', background: 'none', cursor: canUp ? 'pointer' : 'default', opacity: canUp ? 1 : 0.3 }}>▲</button>
        <button onClick={onDown} disabled={!canDown} title="Ниже" style={{ border: 'none', background: 'none', cursor: canDown ? 'pointer' : 'default', opacity: canDown ? 1 : 0.3 }}>▼</button>
        <Button size="sm" variant="danger" onClick={onDelete}>✕</Button>
      </div>

      {open && (
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line,#eef)' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Input label="Ключ" value={field.key} style={{ flex: 1 }} hint="латиница/цифры/_"
              onChange={(e) => set({ key: e.target.value })} />
            <Input label="Подпись" value={field.label} style={{ flex: 2 }}
              onChange={(e) => set({ label: e.target.value })} />
            <Select label="Тип данных" style={{ width: 240 }} options={TYPE_OPTS} value={field.dataType}
              onChange={(e) => set({ dataType: e.target.value as FieldDataType })} />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {field.dataType === 'measured' && (
              <Input label="Единица" value={field.unit ?? ''} style={{ width: 140 }}
                onChange={(e) => set({ unit: e.target.value })} />
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={!!field.required} onChange={(e) => set({ required: e.target.checked })} />
              обязательное
            </label>
            {field.dataType === 'measured' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={!!field.provenance} onChange={(e) => set({ provenance: e.target.checked })} />
                отслеживать источник (провенанс)
              </label>
            )}
          </div>
          <Input label="Подсказка" value={field.hint ?? ''} onChange={(e) => set({ hint: e.target.value })} />

          {field.dataType === 'enum' && (
            <Textarea label="Варианты (по строке: value | подпись)" rows={4} value={optsToText(field.options)}
              onChange={(e) => set({ options: textToOpts(e.target.value) })} />
          )}

          {/* Условная видимость */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <Input label="Видно если поле" value={field.visibleIf?.field ?? ''} style={{ flex: 1 }} hint="ключ другого поля (необяз.)"
              onChange={(e) => {
                const f = e.target.value.trim();
                set({ visibleIf: f ? { field: f, equals: field.visibleIf?.equals ?? [true] } : undefined });
              }} />
            <Input label="равно (через запятую)" value={(field.visibleIf?.equals ?? []).join(', ')} style={{ flex: 1 }}
              disabled={!field.visibleIf?.field}
              onChange={(e) => set({ visibleIf: field.visibleIf?.field ? { field: field.visibleIf.field, equals: e.target.value.split(',').map((s) => parseVal(s.trim())) } : undefined })} />
          </div>

          {isGroup && depth < 2 && (
            <div style={{ marginLeft: 8, paddingLeft: 12, borderLeft: '2px solid var(--line,#dde)' }}>
              <div style={{ fontSize: 13, color: '#889', margin: '4px 0 8px' }}>Вложенные поля:</div>
              <FieldList fields={field.fields ?? []} onChange={(nf) => set({ fields: nf })} depth={depth + 1} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Список полей (рекурсивный) ────────────────────────────────────────────

function FieldList({ fields, onChange, depth }: { fields: FieldSpec[]; onChange: (f: FieldSpec[]) => void; depth: number }) {
  const upd = (i: number, f: FieldSpec) => onChange(fields.map((x, j) => (j === i ? f : x)));
  const del = (i: number) => onChange(fields.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const copy = fields.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const add = () => onChange([...fields, { key: `field_${fields.length + 1}`, label: 'Новое поле', dataType: 'text' }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f, i) => (
        <FieldRow key={i} field={f} depth={depth}
          onChange={(nf) => upd(i, nf)} onDelete={() => del(i)}
          onUp={() => move(i, -1)} onDown={() => move(i, 1)} canUp={i > 0} canDown={i < fields.length - 1} />
      ))}
      <div><Button size="sm" variant="secondary" onClick={add}>+ Добавить поле</Button></div>
    </div>
  );
}

// ─── Редактор схемы ────────────────────────────────────────────────────────

export function SchemaEditor(props: { code: string; name: string; activeVersion: number | null; hasDraft: boolean; working: FieldSpec[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldSpec[]>(props.working);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(props.hasDraft);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [showPreview, setShowPreview] = useState(true);

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
      <div>
        <Link href="/admin/types" style={{ color: '#888', fontSize: 14 }}>← Типы расчёта</Link>
        <h1 style={{ margin: '6px 0 0' }}>Схема ввода — {props.name}</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted,#667)' }}>
          Активная версия: {props.activeVersion ? `v${props.activeVersion}` : 'нет'}{' '}
          {hasDraft && <Badge variant="warning">черновик</Badge>}{' '}
          {dirty && <Badge variant="info">несохранённые правки</Badge>}
          {' · '}{fields.length} полей
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button disabled={busy || !dirty} onClick={() => run(() => saveDraftSchema(props.code, fields), () => { setHasDraft(true); setDirty(false); })}>
          Сохранить черновик
        </Button>
        <Button variant="secondary" disabled={busy || (!hasDraft && !dirty)}
          onClick={() => run(async () => {
            if (dirty) { const s = await saveDraftSchema(props.code, fields); if (!s.ok) return s; }
            return publishSchema(props.code);
          }, () => { setHasDraft(false); setDirty(false); })}>
          Опубликовать версию
        </Button>
        {hasDraft && (
          <Button variant="ghost" disabled={busy}
            onClick={() => run(() => discardDraft(props.code), () => { setHasDraft(false); setDirty(false); })}>
            Удалить черновик
          </Button>
        )}
        <Button variant="ghost" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(0,1.4fr) minmax(0,1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Поля опросного листа" subtitle="Порядок = порядок в форме; тип данных определяет виджет">
          <FieldList fields={fields} onChange={update} depth={0} />
        </Card>
        {showPreview && (
          <Card title="Предпросмотр формы" subtitle="Так поля увидит инженер при заполнении">
            <DynamicForm fields={fields} value={preview} onChange={setPreview} />
          </Card>
        )}
      </div>
    </div>
  );
}
