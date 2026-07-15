'use client';

import { useState, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge, Input, Select } from '@/components/ui';
import { resolveText, type NormLite } from '@/lib/schema/resolve';
import {
  ensureSection, addItem, updateItem, deleteItem, moveItem, publishSection,
  type BaseStep,
} from '@/server/actions/instructions';
import {
  SECTIONS, BASE_TYPE, type ActionResult, type InstructionSection, type InstructionItemRow,
} from '@/server/instructions/spec';

interface Props {
  typeCode: string;
  typeName: string;
  isBase: boolean;
  sections: InstructionSection[];
  base: BaseStep[];
  params: { key: string; label: string }[];
  norms: { code: string; title: string; anchors: { key: string; label: string }[] }[];
}

const mono: CSSProperties = { fontFamily: 'var(--font-mono,monospace)' };

export function InstructionEditor({ typeCode, isBase, sections, base, params, norms }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // предпросмотр: карта норм из переданных якорей (label достаточно для preview)
  const normMap = new Map<string, NormLite>(
    norms.map((n) => [n.code, {
      code: n.code,
      content: Object.fromEntries(n.anchors.map((a) => [a.key, { label: a.label }])),
    }]),
  );
  const paramLabels = new Map(params.map((p) => [p.key, p.label]));

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  const bySection = new Map(sections.map((s) => [s.section, s]));
  const baseBySection = new Map(base.map((b) => [b.section, b.items]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        {isBase
          ? <>Ядро расчёта — <strong>общее для всех типов</strong>. 5 шагов конвейера. Специфику типа заводят в его оверлее.</>
          : <>Методика = <strong>База (ядро)</strong> + оверлей этого типа. По каждому шагу сверху показана база (read-only), ниже — пункты типа (правятся). При движке «Конструктор» всё это собирается в промпт агента.</>}
        {' '}Токены: <code style={mono}>{'{{param:ключ}}'}</code>, <code style={mono}>{'{{norm:код#якорь}}'}</code>.
      </p>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      {SECTIONS.map((sec) => {
        const instr = bySection.get(sec.key);
        const baseItems = baseBySection.get(sec.key) ?? [];
        return (
          <Card key={sec.key} title={sec.label} subtitle={sec.hint}
            action={instr
              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge variant={instr.status === 'active' ? 'success' : 'default'} withDot>
                    {instr.status === 'active' ? `активна · v${instr.version}` : instr.status === 'superseded' ? 'замещена' : 'черновик'}
                  </Badge>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => addItem(instr.id, typeCode))}>+ Пункт</Button>
                  {instr.status !== 'active' && (
                    <Button size="sm" disabled={busy || instr.items.length === 0} onClick={() => run(() => publishSection(instr.id, typeCode))}>Опубликовать</Button>
                  )}
                </div>
              : <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => ensureSection(typeCode, sec.key))}>{isBase ? 'Завести шаг' : '+ Оверлей типа'}</Button>}>

            {/* Слой БАЗЫ (read-only) — для оверлей-типов */}
            {!isBase && baseItems.length > 0 && (
              <div style={{ marginBottom: instr ? 14 : 0, border: '1px dashed var(--border,#dce0e6)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2,#f7f9fb)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Badge variant="default">База · ядро</Badge>
                  <span style={{ fontSize: 12, color: '#889' }}>общее для всех типов — <Link href={`/admin/types/${BASE_TYPE}/instructions`} style={{ color: 'var(--hydro,#1668a8)' }}>править в Базе</Link></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {baseItems.map((b, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      <strong style={{ color: '#556' }}>{b.title}.</strong>{' '}
                      <span style={{ color: '#667', whiteSpace: 'pre-wrap' }}>{resolveText(b.body, normMap, paramLabels)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Слой типа (правимый) */}
            {!isBase && (instr || baseItems.length > 0) && (
              <div style={{ fontSize: 12, color: '#889', textTransform: 'uppercase', letterSpacing: .5, margin: '2px 0 8px' }}>Специфика типа</div>
            )}
            {!instr && <span style={{ color: '#aaa', fontSize: 13 }}>{isBase ? 'Шаг не заведён.' : 'Нет оверлея — база выше применяется как есть.'}</span>}
            {instr && instr.items.length === 0 && <span style={{ color: '#aaa', fontSize: 13 }}>Нет пунктов — добавьте первый.</span>}
            {instr && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {instr.items.map((item, i) => (
                  <ItemRow key={item.id} item={item} typeCode={typeCode} params={params} norms={norms}
                    normMap={normMap} paramLabels={paramLabels} busy={busy} run={run}
                    isFirst={i === 0} isLast={i === instr.items.length - 1} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Один адресуемый кусок ──────────────────────────────────────────────────

function ItemRow({
  item, typeCode, params, norms, normMap, paramLabels, busy, run, isFirst, isLast,
}: {
  item: InstructionItemRow;
  typeCode: string;
  params: { key: string; label: string }[];
  norms: Props['norms'];
  normMap: Map<string, NormLite>;
  paramLabels: Map<string, string>;
  busy: boolean;
  run: (fn: () => Promise<ActionResult>) => Promise<boolean>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [paramKey, setParamKey] = useState(item.paramKey ?? '');
  const [body, setBody] = useState(item.body);
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const touch = () => setDirty(true);

  const insert = (token: string) => {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : body.length;
    const next = body.slice(0, at) + token + body.slice(el ? el.selectionEnd : body.length);
    setBody(next); setDirty(true);
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + token.length; } });
  };

  const preview = resolveText(body, normMap, paramLabels);

  return (
    <div style={{ border: '1px solid var(--border,#e3e6ea)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <Input label="Заголовок" value={title} style={{ flex: 2 }}
          onChange={(e) => { setTitle(e.target.value); touch(); }} />
        <Select label="Параметр (адрес правки)" value={paramKey} style={{ flex: 1 }}
          placeholder="— не привязан —"
          options={params.map((p) => ({ value: p.key, label: `${p.label} (${p.key})` }))}
          onChange={(e) => { setParamKey(e.target.value); touch(); }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" variant="ghost" disabled={busy || isFirst} onClick={() => run(() => moveItem(item.id, typeCode, 'up'))}>↑</Button>
          <Button size="sm" variant="ghost" disabled={busy || isLast} onClick={() => run(() => moveItem(item.id, typeCode, 'down'))}>↓</Button>
        </div>
      </div>

      {/* вставка токенов */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#889' }}>Вставить:</span>
        <select defaultValue="" style={pickerStyle}
          onChange={(e) => { if (e.target.value) insert(`{{param:${e.target.value}}}`); e.target.value = ''; }}>
          <option value="">параметр…</option>
          {params.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select defaultValue="" style={pickerStyle}
          onChange={(e) => { if (e.target.value) insert(`{{norm:${e.target.value}}}`); e.target.value = ''; }}>
          <option value="">норма…</option>
          {norms.map((n) => [
            <option key={n.code} value={n.code}>{n.code}</option>,
            ...n.anchors.map((a) => <option key={`${n.code}#${a.key}`} value={`${n.code}#${a.key}`}>&nbsp;&nbsp;{n.code} · {a.label}</option>),
          ])}
        </select>
      </div>

      <textarea ref={bodyRef} value={body} onChange={(e) => { setBody(e.target.value); touch(); }}
        rows={4} placeholder="Текст пункта. Ссылки на нормы/параметры — токенами (вставка выше)."
        style={{ width: '100%', resize: 'vertical', padding: 10, borderRadius: 8, border: '1px solid var(--border,#e3e6ea)', fontSize: 14, fontFamily: 'inherit' }} />

      {/* предпросмотр развёрнутого текста */}
      {body.trim() && (
        <div style={{ fontSize: 13, color: '#556', background: 'var(--surface-2,#f6f8fa)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
          <span style={{ fontSize: 11, color: '#8a94a0', textTransform: 'uppercase', letterSpacing: .5 }}>предпросмотр</span>
          <div style={{ marginTop: 4 }}>{preview}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="danger" disabled={busy}
          onClick={() => { if (confirm('Удалить пункт?')) run(() => deleteItem(item.id, typeCode)); }}>Удалить</Button>
        <Button size="sm" disabled={busy || !dirty}
          onClick={async () => { if (await run(() => updateItem(item.id, typeCode, { paramKey, title, body }))) setDirty(false); }}>
          Сохранить{dirty ? ' •' : ''}
        </Button>
      </div>
    </div>
  );
}

const pickerStyle: CSSProperties = {
  fontSize: 13, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border,#e3e6ea)', background: 'var(--surface,#fff)', cursor: 'pointer',
};
