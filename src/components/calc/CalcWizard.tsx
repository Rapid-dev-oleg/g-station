'use client';

/**
 * Мастер нового расчёта (Фаза 1). Шаги мастера = шаги пайплайна типа.
 * Реализован шаг 1 «Вход»: тип + клиент/проект (опц.) + карточка по схеме
 * (DynamicForm, видна всегда), ввод вручную или из файлов (parse-document).
 * «Далее» создаёт систему (commitIntake). Отдельный флоу — /intake не трогает.
 */
import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Select, Input } from '@/components/ui';
import { DynamicForm } from '@/components/schema/DynamicForm';
import type { FieldSpec } from '@/lib/schema/types';
import type { Meta } from '@/lib/dossier/types';
import { parseUploadedDocument } from '@/server/actions/parse';
import { startPipelineRun } from '@/server/actions/pipeline';

interface TypeOpt { code: string; name: string; status: string; ready: boolean; fields: FieldSpec[] }
interface ProjectOpt { id: string; name: string; clientName: string }

const STEPS = ['Вход', 'Расчёт', 'Подбор', 'Цена', 'Выход'];
const mono: CSSProperties = { fontFamily: 'var(--font-mono,monospace)' };

export function CalcWizard({ ownerId, types, projects }: { ownerId: string; types: TypeOpt[]; projects: ProjectOpt[] }) {
  const router = useRouter();
  const ready = types.filter((t) => t.ready);
  const [typeCode, setTypeCode] = useState(ready[0]?.code ?? types[0]?.code ?? '');
  const cur = types.find((t) => t.code === typeCode);
  const [mode, setMode] = useState<'manual' | 'docs'>('manual');
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [meta, setMeta] = useState<Partial<Meta>>({});
  const [projectId, setProjectId] = useState('');
  const [systemName, setSystemName] = useState('Новая станция');
  const [objectName, setObjectName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!files.length) { setError('Добавьте файлы ТЗ'); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    if (projectId) fd.append('projectId', projectId);
    const res = await parseUploadedDocument(fd, ownerId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    if (res.mode === 'redirect') { router.replace(res.redirect); router.refresh(); return; }
    if (res.mode === 'review') {
      const first = res.result.systems[0];
      setInput(first?.input ?? {});
      if (first?.systemName) setSystemName(first.systemName);
      setMeta(res.result.meta);
      if (res.result.meta.object_name) setObjectName(res.result.meta.object_name);
    }
  }

  async function next() {
    setBusy(true); setError(null);
    try {
      const card = { станция: systemName || undefined, объект: objectName || meta.object_name || undefined, input };
      const res = await startPipelineRun({ typeCode, card });
      router.push(`/calc/runs/${res.id}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Не удалось запустить расчёт');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Степпер = шаги пайплайна типа */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '2px 4px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : '0 0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: i === 0 ? 'var(--text,#14202b)' : 'var(--text-faint,#8b98a5)' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 600,
                  border: `1.5px solid ${i === 0 ? 'var(--hydro,#1668a8)' : 'var(--border,#dfe6ec)'}`,
                  color: i === 0 ? 'var(--hydro,#1668a8)' : 'inherit',
                }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <span style={{ flex: 1, minWidth: 14, height: 1.5, background: 'var(--border,#dfe6ec)', margin: '0 8px' }} />}
            </div>
          ))}
        </div>
      </Card>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      {/* Шаг 1 · Вход */}
      <Card title="Шаг 1 · Вход" subtitle="Тип станции и карточка параметров. Универсально для всех типов.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* тип + клиент/проект */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Select label="Тип станции" value={typeCode}
              options={types.map((t) => ({ value: t.code, label: `${t.name}${t.ready ? '' : ' · план'}` }))}
              onChange={(e) => { setTypeCode(e.target.value); setInput({}); }} />
            <Select label="Проект (необязательно)" value={projectId} placeholder="— не привязан —"
              options={projects.map((p) => ({ value: p.id, label: `${p.name} · ${p.clientName}` }))}
              onChange={(e) => setProjectId(e.target.value)} />
            <Input label="Название станции" value={systemName} onChange={(e) => setSystemName(e.target.value)} />
          </div>

          {!cur?.ready && (
            <div style={{ fontSize: 13, color: 'var(--text-muted,#667)', background: 'var(--surface-2,#f5f8fb)', borderRadius: 8, padding: '10px 12px' }}>
              Тип «{cur?.name}» ещё в разработке (нет активной схемы). Пока доступен расчёт готовых типов.
            </div>
          )}

          {/* режим ввода */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-faint,#8b98a5)', fontWeight: 600 }}>Ввод карточки</span>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              <Button size="sm" variant={mode === 'manual' ? 'secondary' : 'ghost'} onClick={() => setMode('manual')}>Вручную</Button>
              <Button size="sm" variant={mode === 'docs' ? 'secondary' : 'ghost'} onClick={() => setMode('docs')}>Из файлов</Button>
            </div>
          </div>

          {/* из файлов */}
          {mode === 'docs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px dashed var(--border,#dfe6ec)', borderRadius: 10, padding: 14, background: 'var(--surface-2,#f5f8fb)' }}>
              <input type="file" multiple accept=".pdf,.docx,.xlsx,.txt"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              {files.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {files.map((f, i) => <span key={i} style={{ ...mono, fontSize: 12, background: 'var(--surface,#fff)', border: '1px solid var(--border,#dfe6ec)', borderRadius: 999, padding: '3px 10px', color: 'var(--text-muted,#667)' }}>{f.name}</span>)}
                </div>
              )}
              <div><Button size="sm" disabled={busy || !files.length} onClick={parse}>{busy ? 'Разбираю…' : 'Разобрать ИИ → заполнить схему'}</Button></div>
              <span style={{ fontSize: 12, color: 'var(--text-muted,#667)' }}>ИИ извлечёт карточку и заполнит схему ниже; поля получат метку источника (из ТЗ / допущение).</span>
            </div>
          )}

          {/* СХЕМА — всегда */}
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-faint,#8b98a5)', fontWeight: 600, marginBottom: 12 }}>
              Схема параметров — {cur?.name}
            </div>
            {cur?.fields.length
              ? <DynamicForm fields={cur.fields} value={input} onChange={setInput} />
              : <span style={{ color: '#aaa', fontSize: 13 }}>У типа нет активной схемы.</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft,#eaeff4)', paddingTop: 16 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted,#667)' }}>
              Проверьте карточку (гейт 1) — метки источника у полей показывают, что извлечено и что додумано.
            </span>
            <Button disabled={busy || !cur?.ready} onClick={next}>
              {busy ? 'Создаю…' : 'Далее — Расчёт →'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
