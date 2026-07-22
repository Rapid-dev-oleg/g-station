'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select, Textarea, Modal } from '@/components/ui';
import {
  addTypeStep, updateTypeStep, deleteTypeStep, moveTypeStep,
  type TypeStepRow, type ActionResult, type StepKind,
} from '@/server/actions/type-steps';

const KINDS: { value: StepKind; label: string }[] = [
  { value: 'input', label: 'Вход (карточка/схема)' },
  { value: 'llm', label: 'Расчёт агентом (LLM)' },
  { value: 'script', label: 'Скрипт (детерминир.)' },
  { value: 'doc', label: 'Создание документов' },
];
const KIND_LABEL: Record<string, string> = { input: 'вход', llm: 'агент', script: 'скрипт', doc: 'документы' };

interface EditState { id: string; label: string; kind: StepKind; directive: string; gate: boolean }

export function StepsTab({ code, skillName, steps }: { code: string; skillName: string; steps: TypeStepRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ label: string; kind: StepKind } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        Шаги конвейера этого типа — <b>данные</b>: добавляй, переставляй, удаляй. Пайплайн идёт по ним по порядку.
        Каждый шаг = скил (файл методики) + директива агенту. Скил <code style={{ fontFamily: 'var(--font-mono,monospace)' }}>{skillName}</code>.
      </p>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      <Card title="Шаги" action={<Button size="sm" onClick={() => setCreating({ label: '', kind: 'llm' })}>+ Добавить шаг</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.length === 0 && <span style={{ color: '#aaa', fontSize: 13 }}>Шагов нет — добавьте первый.</span>}
          {steps.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border,#e3e6ea)', borderRadius: 10, padding: '12px 14px' }}>
              <span style={{ flex: 'none', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--hydro,#1668a8) 12%, transparent)', color: 'var(--hydro,#1668a8)', fontWeight: 700, fontFamily: 'var(--font-mono,monospace)', fontSize: 13 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{s.label}</strong>
                  <Badge variant="default">{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  {s.gate && <Badge variant="warning">гейт</Badge>}
                </div>
                {s.file && <code style={{ fontSize: 11.5, color: '#889', fontFamily: 'var(--font-mono,monospace)' }}>{s.file}</code>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Button size="sm" variant="ghost" disabled={busy || i === 0} onClick={() => run(() => moveTypeStep(s.id, code, 'up'))}>↑</Button>
                <Button size="sm" variant="ghost" disabled={busy || i === steps.length - 1} onClick={() => run(() => moveTypeStep(s.id, code, 'down'))}>↓</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id, label: s.label, kind: s.kind as StepKind, directive: s.directive ?? '', gate: s.gate })}>Настроить</Button>
                {s.kind !== 'input' && s.file && <Button size="sm" variant="secondary" onClick={() => router.push(`/admin/types/${code}/steps/${s.key}`)}>Скил →</Button>}
                {s.kind === 'input' && <Button size="sm" variant="secondary" onClick={() => router.push(`/admin/types/${code}/steps/${s.key}`)}>Скил →</Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* добавить шаг */}
      {creating && (
        <Modal open onClose={() => setCreating(null)} title="Новый шаг"
          footer={<>
            <Button variant="ghost" onClick={() => setCreating(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => { if (await run(() => addTypeStep(code, creating))) setCreating(null); }}>Добавить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Название шага" value={creating.label} autoFocus hint="Напр. «Создание документов»"
              onChange={(e) => setCreating({ ...creating, label: e.target.value })} />
            <Select label="Тип шага" value={creating.kind}
              options={KINDS.filter((k) => k.value !== 'input')}
              onChange={(e) => setCreating({ ...creating, kind: e.target.value as StepKind })} />
          </div>
        </Modal>
      )}

      {/* настроить шаг */}
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title="Настройка шага"
          footer={<>
            <Button variant="danger" disabled={busy} style={{ marginRight: 'auto' }}
              onClick={async () => { if (confirm('Удалить шаг?') && await run(() => deleteTypeStep(edit.id, code))) setEdit(null); }}>Удалить</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              if (await run(() => updateTypeStep(edit.id, code, { label: edit.label, kind: edit.kind, directive: edit.directive, gate: edit.gate }))) setEdit(null);
            }}>Сохранить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Название" value={edit.label} style={{ flex: 1 }} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
              <Select label="Тип" style={{ width: 240 }} value={edit.kind} options={KINDS}
                onChange={(e) => setEdit({ ...edit, kind: e.target.value as StepKind })} />
            </div>
            <Textarea label="Директива агенту" value={edit.directive} rows={3} hint="Что сделать на этом шаге (промпт). Для «Входа» — не нужна."
              onChange={(e) => setEdit({ ...edit, directive: e.target.value })} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={edit.gate} onChange={(e) => setEdit({ ...edit, gate: e.target.checked })} />
              Гейт — пауза на инженера после шага (напр. подтвердить курс/наценку)
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
