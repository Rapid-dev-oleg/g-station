'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Table, Modal, EmptyState } from '@/components/ui';
import {
  createNorm, updateNorm, setNormStatus, deleteNorm,
  type AdminNorm, type NormAnchor, type ActionResult,
} from '@/server/actions/norms';

interface EditState {
  id: string; code: string; title: string; category: string; version: string;
  summary: string; url: string; anchors: NormAnchor[];
}

export function NormsManager({ norms }: { norms: AdminNorm[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ code: string; title: string; category: string; version: string; url: string } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  const openEdit = (n: AdminNorm) => setEdit({
    id: n.id, code: n.code, title: n.title, category: n.category, version: n.version ?? '',
    summary: n.summary ?? '', url: n.url ?? '', anchors: n.anchors.map((a) => ({ ...a })),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Библиотека норм</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted,#667)' }}>
          СП/ГОСТ с якорями (таблицы/формулы). Инструкции ссылаются токеном {'{{'}norm:код#якорь{'}}'}; правка ГОСТа — здесь, в одном месте.
        </p>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      <Card title="Нормы" subtitle="Код несёт версию (год). Якоря — адресуемые куски нормы для ссылок из инструкций"
        action={<Button size="sm" onClick={() => setCreating({ code: '', title: '', category: 'common', version: '', url: '' })}>+ Норма</Button>}>
        <Table
          columns={[
            { key: 'code', header: 'Код', render: (n: AdminNorm) => <strong style={{ fontFamily: 'var(--font-mono,monospace)' }}>{n.code}</strong> },
            { key: 'title', header: 'Название', render: (n) => n.title },
            { key: 'cat', header: 'Категория', render: (n) => <Badge variant="info">{n.category}</Badge> },
            { key: 'anchors', header: 'Якоря', align: 'right', render: (n) => n.anchors.length || '—' },
            { key: 'status', header: 'Статус', render: (n) => n.status === 'active'
                ? <Badge variant="success" withDot>активна</Badge>
                : <Badge variant="default" withDot>замещена</Badge> },
            { key: 'act', header: '', align: 'right', render: (n) => (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>Редактировать</Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => run(() => setNormStatus(n.id, n.status === 'active' ? 'superseded' : 'active'))}>
                    {n.status === 'active' ? 'Заместить' : 'Вернуть'}
                  </Button>
                </div>
              ) },
          ]}
          rows={norms}
          getRowKey={(n) => n.id}
          emptyState={<EmptyState title="Нет норм" description="Добавьте первую норму." />}
        />
      </Card>

      {/* создать норму */}
      {creating && (
        <Modal open onClose={() => setCreating(null)} title="Новая норма"
          footer={<>
            <Button variant="ghost" onClick={() => setCreating(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => { if (await run(() => createNorm(creating))) setCreating(null); }}>Создать</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Код" value={creating.code} autoFocus hint="Напр. СП 8.13130.2020 (год = версия)"
              onChange={(e) => setCreating({ ...creating, code: e.target.value })} />
            <Input label="Название" value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} />
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Категория" value={creating.category} style={{ flex: 1 }} hint="fire | water | drain | common …"
                onChange={(e) => setCreating({ ...creating, category: e.target.value })} />
              <Input label="URL" value={creating.url} style={{ flex: 1 }} onChange={(e) => setCreating({ ...creating, url: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {/* редактировать норму + якоря */}
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title={`Норма — ${edit.code}`}
          footer={<>
            <Button variant="danger" disabled={busy} style={{ marginRight: 'auto' }}
              onClick={async () => { if (confirm('Удалить норму?') && await run(() => deleteNorm(edit.id))) setEdit(null); }}>Удалить</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              const okr = await run(() => updateNorm(edit.id, {
                title: edit.title, category: edit.category, version: edit.version,
                summary: edit.summary, url: edit.url, anchors: edit.anchors,
              }));
              if (okr) setEdit(null);
            }}>Сохранить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Название" value={edit.title} style={{ flex: 2 }} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <Input label="Категория" value={edit.category} style={{ width: 160 }} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Версия (опц.)" value={edit.version} style={{ width: 160 }} onChange={(e) => setEdit({ ...edit, version: e.target.value })} />
              <Input label="URL" value={edit.url} style={{ flex: 1 }} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
            </div>
            <Input label="Краткое содержание" value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} />

            {/* Якоря — адресуемые куски (таблицы/формулы/значения) */}
            <div>
              <div style={{ fontSize: 13, color: '#667', marginBottom: 6 }}>Якоря (адресуемые куски: {'{{'}norm:{edit.code}#ключ{'}}'})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {edit.anchors.length === 0 && <span style={{ color: '#aaa', fontSize: 13 }}>Нет якорей — норму можно цитировать целиком.</span>}
                {edit.anchors.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Input placeholder="ключ (табл2)" value={a.key} style={{ width: 140 }}
                      onChange={(e) => setEdit({ ...edit, anchors: edit.anchors.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} />
                    <Input placeholder="подпись" value={a.label} style={{ width: 200 }}
                      onChange={(e) => setEdit({ ...edit, anchors: edit.anchors.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                    <Input placeholder="значение/содержимое (опц.)" value={a.value ?? ''} style={{ flex: 1 }}
                      onChange={(e) => setEdit({ ...edit, anchors: edit.anchors.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                    <Button size="sm" variant="danger" onClick={() => setEdit({ ...edit, anchors: edit.anchors.filter((_, j) => j !== i) })}>✕</Button>
                  </div>
                ))}
                <div><Button size="sm" variant="secondary" onClick={() => setEdit({ ...edit, anchors: [...edit.anchors, { key: '', label: '' }] })}>+ Якорь</Button></div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
