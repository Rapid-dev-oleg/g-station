'use client';

/**
 * Динамическая форма из field-spec (конструктор схем, C1).
 * Рендерит поля по типу данных, поддерживает условную видимость (visibleIf) и
 * вложенные group/array. Значение — объект, ключи совпадают с dossier.input,
 * поэтому форма взаимозаменяема с прежней захардкоженной карточкой.
 */
import { Input, NumberInput, Select, Textarea, Badge } from '@/components/ui';
import type { FieldSpec } from '@/lib/schema/types';

type Val = Record<string, unknown>;
interface Measured { value: number | null; unit?: string; source?: string; note?: string }

const SOURCE_LABEL: Record<string, string> = {
  extracted: 'из документа', derived: 'выведено', assumed: 'допущение',
  operator: 'инженер', calculated: 'расчёт', default: 'по умолчанию',
};

function isVisible(field: FieldSpec, value: Val): boolean {
  if (!field.visibleIf) return true;
  const v = value[field.visibleIf.field];
  return field.visibleIf.equals.some((e) => e === v);
}

function FieldWidget({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.dataType) {
    case 'measured': {
      const m = (value as Measured) ?? {};
      const unit = field.unit ?? m.unit;
      return (
        <div>
          <NumberInput
            label={field.label}
            required={field.required}
            suffix={unit}
            step="any"
            hint={field.hint}
            value={m.value === null || m.value === undefined ? '' : m.value}
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.').trim();
              const num = raw === '' ? null : Number(raw);
              onChange({ value: Number.isFinite(num as number) ? (num as number) : null, unit, source: 'operator', note: m.note });
            }}
          />
          {field.provenance && m.source && (
            <div style={{ marginTop: 4 }}><Badge variant="info">{SOURCE_LABEL[m.source] ?? m.source}</Badge></div>
          )}
        </div>
      );
    }
    case 'number': {
      const n = value as number | null | undefined;
      return (
        <NumberInput label={field.label} required={field.required} hint={field.hint} step="any"
          value={n === null || n === undefined ? '' : n}
          onChange={(e) => { const raw = e.target.value.trim(); onChange(raw === '' ? undefined : Number(raw)); }} />
      );
    }
    case 'enum':
      return (
        <Select label={field.label} required={field.required} hint={field.hint}
          options={field.options ?? []} placeholder="— не выбрано —"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)} />
      );
    case 'boolean':
      return (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, paddingTop: 6 }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case 'textarea':
      return (
        <Textarea label={field.label} required={field.required} hint={field.hint} rows={3}
          value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value || undefined)} />
      );
    case 'text':
      return (
        <Input label={field.label} required={field.required} hint={field.hint}
          value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value || undefined)} />
      );
    case 'group':
      return (
        <div style={{ border: '1px solid var(--line,#dde)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{field.label}</div>
          <DynamicForm fields={field.fields ?? []} value={(value as Val) ?? {}} onChange={onChange} />
        </div>
      );
    case 'array': {
      const items = (Array.isArray(value) ? value : []) as Val[];
      const setItem = (i: number, v: Val) => onChange(items.map((x, j) => (j === i ? v : x)));
      const del = (i: number) => onChange(items.filter((_, j) => j !== i));
      const add = () => onChange([...items, {}]);
      return (
        <div style={{ border: '1px solid var(--line,#dde)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{field.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item, i) => (
              <div key={i} style={{ border: '1px dashed var(--line,#dde)', borderRadius: 6, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#889', fontSize: 13 }}>#{i + 1}</span>
                  <button onClick={() => del(i)} style={{ border: 'none', background: 'none', color: '#c33', cursor: 'pointer' }}>Удалить</button>
                </div>
                <DynamicForm fields={field.fields ?? []} value={item} onChange={(v) => setItem(i, v)} />
              </div>
            ))}
            <div><button onClick={add} style={{ border: '1px solid var(--line,#dde)', borderRadius: 6, padding: '6px 12px', background: 'var(--surface,#fff)', cursor: 'pointer' }}>+ Добавить</button></div>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

export function DynamicForm({ fields, value, onChange }: {
  fields: FieldSpec[];
  value: Val;
  onChange: (next: Val) => void;
}) {
  const set = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {fields.filter((f) => isVisible(f, value)).map((f) => (
        <FieldWidget key={f.key} field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
    </div>
  );
}
