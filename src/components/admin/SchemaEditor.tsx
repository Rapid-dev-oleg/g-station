'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select, Modal } from '@/components/ui';
import { DynamicForm } from '@/components/schema/DynamicForm';
import type { FieldSpec, FieldDataType, FieldOption } from '@/lib/schema/types';
import {
  saveDraftSchema, publishSchema, discardDraft, proposeSchemaFields, type ActionResult,
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

const parseVal = (s: string): string | number | boolean =>
  s === 'true' ? true : s === 'false' ? false : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;

const linkBtn: CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--hydro,#1668a8)', fontSize: 13, padding: 0 };

// ─── Список вариантов (для enum) — строки с попап-редактированием ───────────

function OptionsEditor({ options, onChange }: { options: FieldOption[]; onChange: (o: FieldOption[]) => void }) {
  const [modal, setModal] = useState<{ index: number; value: string; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const commit = () => {
    if (!modal) return;
    const value = modal.value.trim();
    if (!value) { setErr('Укажите значение'); return; }
    if (options.some((o, i) => o.value === value && i !== modal.index)) { setErr(`Значение «${value}» уже есть`); return; }
    const opt: FieldOption = { value, label: modal.label.trim() || value };
    onChange(modal.index === -1 ? [...options, opt] : options.map((o, i) => (i === modal.index ? opt : o)));
    setModal(null); setErr(null);
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: '#667', marginBottom: 6 }}>Варианты выбора</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.length === 0 && <span style={{ color: '#aaa', fontSize: 13 }}>Нет вариантов — добавьте.</span>}
        {options.map((o, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line,#dde)', borderRadius: 6, padding: '6px 10px' }}>
            <span style={{ flex: 1 }}>{o.label}</span>
            <span style={{ fontFamily: 'monospace', color: '#889', fontSize: 12 }}>{o.value}</span>
            <button style={linkBtn} onClick={() => { setErr(null); setModal({ index: i, value: o.value, label: o.label }); }}>Изменить</button>
            <button style={{ ...linkBtn, color: '#c33' }} onClick={() => onChange(options.filter((_, j) => j !== i))}>Удалить</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="secondary" onClick={() => { setErr(null); setModal({ index: -1, value: '', label: '' }); }}>+ Добавить вариант</Button>
      </div>
      {modal && (
        <Modal open onClose={() => setModal(null)} title={modal.index === -1 ? 'Новый вариант' : 'Изменить вариант'}
          footer={<>
            <Button variant="ghost" onClick={() => setModal(null)}>Отмена</Button>
            <Button onClick={commit}>Сохранить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {err && <div style={{ color: '#c33', fontSize: 13 }}>{err}</div>}
            <Input label="Значение (value)" value={modal.value} autoFocus hint="Хранится в данных (латиница/код)"
              onChange={(e) => setModal({ ...modal, value: e.target.value })} />
            <Input label="Подпись" value={modal.label} hint="Как показывать в форме (если пусто — значение)"
              onChange={(e) => setModal({ ...modal, label: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Условная видимость поля (по-человечески) ──────────────────────────────
// Вместо ввода ключа+значений — «Показывать: Всегда / Только если [поле] = [знач]»
// с выпадашками по подписям. equals храним массивом (модель), UI ставит одно.

function VisibilityEditor({ field, siblings, onChange }: {
  field: FieldSpec;
  siblings: FieldSpec[];
  onChange: (patch: Partial<FieldSpec>) => void;
}) {
  const cond = !!field.visibleIf?.field;
  const target = siblings.find((s) => s.key === field.visibleIf?.field);
  const currentVal = field.visibleIf?.equals?.[0];

  // варианты значения зависят от типа целевого поля
  const valueOptions =
    target?.dataType === 'boolean' ? [{ value: 'true', label: 'Да' }, { value: 'false', label: 'Нет' }]
    : target?.dataType === 'enum' ? (target.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
    : null; // прочие типы — свободный ввод

  const defaultFor = (t?: FieldSpec): string | number | boolean =>
    t?.dataType === 'boolean' ? true : t?.dataType === 'enum' ? (t.options?.[0]?.value ?? '') : '';

  const pickField = (key: string) => {
    if (!key) { onChange({ visibleIf: undefined }); return; }
    onChange({ visibleIf: { field: key, equals: [defaultFor(siblings.find((s) => s.key === key))] } });
  };
  const pickValue = (raw: string) => {
    if (!field.visibleIf?.field) return;
    const v: string | number | boolean =
      target?.dataType === 'boolean' ? raw === 'true'
      : target?.dataType === 'enum' ? raw // enum-значение всегда строкой (строгое сравнение)
      : parseVal(raw);
    onChange({ visibleIf: { field: field.visibleIf.field, equals: [v] } });
  };

  const radio = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' } as const;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#889', marginBottom: 6 }}>Показывать поле</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={radio}>
          <input type="radio" name={`vis-${field.key}`} checked={!cond} onChange={() => onChange({ visibleIf: undefined })} />
          Всегда
        </label>
        <label style={radio}>
          <input type="radio" name={`vis-${field.key}`} checked={cond} disabled={siblings.length === 0}
            onChange={() => { if (!cond && siblings[0]) pickField(siblings[0].key); }} />
          Только если
        </label>
        {cond && (
          <>
            <Select style={{ minWidth: 180 }} value={field.visibleIf?.field ?? ''}
              options={siblings.map((s) => ({ value: s.key, label: s.label || s.key }))}
              onChange={(e) => pickField(e.target.value)} />
            <span style={{ color: '#889' }}>=</span>
            {valueOptions
              ? <Select style={{ minWidth: 120 }} value={String(currentVal)} options={valueOptions} onChange={(e) => pickValue(e.target.value)} />
              : <Input style={{ width: 160 }} value={String(currentVal ?? '')} placeholder="значение" onChange={(e) => pickValue(e.target.value)} />}
          </>
        )}
      </div>
      {siblings.length === 0 && (
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Нет других полей для условия — добавьте поля, от которых зависит показ.</div>
      )}
    </div>
  );
}

// ─── Одно поле ─────────────────────────────────────────────────────────────

function FieldRow({ field, siblings, onChange, onDelete, onUp, onDown, canUp, canDown, depth }: {
  field: FieldSpec;
  siblings: FieldSpec[];
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
            <OptionsEditor options={field.options ?? []} onChange={(o) => set({ options: o })} />
          )}

          {/* Условная видимость — по-человечески */}
          <VisibilityEditor field={field} siblings={siblings} onChange={set} />

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

export function FieldList({ fields, onChange, depth }: { fields: FieldSpec[]; onChange: (f: FieldSpec[]) => void; depth: number }) {
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
        <FieldRow key={i} field={f} depth={depth} siblings={fields.filter((_, j) => j !== i)}
          onChange={(nf) => upd(i, nf)} onDelete={() => del(i)}
          onUp={() => move(i, -1)} onDown={() => move(i, 1)} canUp={i > 0} canDown={i < fields.length - 1} />
      ))}
      <div><Button size="sm" variant="secondary" onClick={add}>+ Добавить поле</Button></div>
    </div>
  );
}

// ─── ИИ-помощник схемы ─────────────────────────────────────────────────────
// Инженер описывает словами → ИИ предлагает ПОЛНЫЙ новый список полей → превью
// (было N → станет M) → «Применить» кладёт поля в редактор как несохранённый
// черновик (сохранение/публикация — как обычно). Тот же паттерн, что правка
// методики. Ничего не пишет в БД сам.

function SchemaAssistant({ code, fields, onApply }: {
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
    const r = await proposeSchemaFields(code, instruction, fields);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setProposal(r.fields);
  }

  return (
    <Card>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong style={{ flex: 1 }}>ИИ-помощник схемы</strong>
        <span style={{ fontSize: 13, color: 'var(--text-muted,#667)' }}>опишите поля словами — ИИ соберёт</span>
        <span style={{ color: '#889' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, borderTop: '1px solid var(--line,#eef)', paddingTop: 14 }}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={'Напр.: «Добавь поле «Этажность» (число, обязательное) и enum «Материал труб» с вариантами сталь/полипропилен/чугун. Убери поле про жокей-насос.»'}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line,#dde)', font: 'inherit', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button size="sm" disabled={busy || !instruction.trim()} onClick={propose}>
              {busy ? 'ИИ думает…' : proposal ? 'Предложить заново' : 'Предложить поля'}
            </Button>
            <span style={{ fontSize: 12.5, color: 'var(--text-faint,#8b98a5)' }}>
              Предложение можно проверить и поправить вручную; в БД ничего не пишется до «Сохранить черновик».
            </span>
          </div>

          {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 13 }}>{error}</div>}

          {proposal && (
            <div style={{ border: '1px solid color-mix(in srgb, var(--hydro,#1668a8) 30%, var(--line,#dde))', borderRadius: 8, padding: '12px 14px', background: 'color-mix(in srgb, var(--hydro,#1668a8) 5%, var(--surface,#fff))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>ИИ предложил {proposal.length} {plural(proposal.length)}</strong>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted,#667)' }}>(сейчас {fields.length})</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {proposal.map((f) => (
                  <span key={f.key} style={{ fontSize: 12, borderRadius: 999, padding: '2px 10px', background: 'var(--surface-2,#f6f8fa)', border: '1px solid var(--line,#dde)' }}>
                    {f.label || f.key} <span style={{ color: '#889' }}>· {TYPE_LABEL[f.dataType] ?? f.dataType}</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => { onApply(proposal); setProposal(null); setInstruction(''); }}>
                  Применить в редактор
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>Отклонить</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'поле' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'поля' : 'полей');

// ─── Редактор схемы ────────────────────────────────────────────────────────

export function SchemaEditor(props: { code: string; name: string; activeVersion: number | null; hasDraft: boolean; working: FieldSpec[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldSpec[]>(props.working);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(props.hasDraft);
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
        Поля ввода — что спрашиваем у ТЗ/инженера. Активная версия:{' '}
        {props.activeVersion ? `v${props.activeVersion}` : 'нет'}{' '}
        {hasDraft && <Badge variant="warning">черновик</Badge>}{' '}
        {dirty && <Badge variant="info">несохранённые правки</Badge>}
        {' · '}{fields.length} полей
      </p>

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

      <SchemaAssistant code={props.code} fields={fields} onApply={update} />

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
