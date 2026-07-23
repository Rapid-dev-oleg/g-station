'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select, Table, Modal, EmptyState } from '@/components/ui';
import {
  createSource, updateSource, toggleSource, deleteSource,
  type SourceRow, type ActionResult,
} from '@/server/actions/sources';

const KIND_OPTS = [
  { value: 'catalog_db', label: 'Каталог (наша БД)' },
  { value: 'api', label: 'API (внешний)' },
  { value: 'web_trusted', label: 'Доверенный сайт' },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTS.map((o) => [o.value, o.label.split(' (')[0]]));

interface EditState {
  id: string | null; // null → создание
  name: string; kind: string; baseUrl: string; token: string;
  priority: string; trustScore: string; note: string;
}

const empty: EditState = { id: null, name: '', kind: 'api', baseUrl: '', token: '', priority: '100', trustScore: '5', note: '' };

export function SourcesManager({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  const openEdit = (s: SourceRow) => setEdit({
    id: s.id, name: s.name, kind: s.kind, baseUrl: s.baseUrl ?? '', token: s.token ?? '',
    priority: String(s.priority), trustScore: String(s.trustScore), note: s.note ?? '',
  });

  const save = async () => {
    if (!edit) return;
    const input = {
      name: edit.name, kind: edit.kind, baseUrl: edit.baseUrl, token: edit.token,
      priority: Number(edit.priority) || 100, trustScore: Number(edit.trustScore) || 5, note: edit.note,
    };
    const ok = await run(() => (edit.id ? updateSource(edit.id, input) : createSource(input)));
    if (ok) setEdit(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Источники подбора</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted,#667)' }}>
          Откуда агент берёт варианты оборудования: наш каталог (БД), внешний API (напр. Wellmix), доверенные сайты.
          Приоритет — меньше = раньше; скоринг доверия 1–10 (сначала доверенные, потом веб).
        </p>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      <Card title="Реестр источников" subtitle="Агент ходит по активным источникам через MCP по приоритету"
        action={<Button size="sm" onClick={() => { setError(null); setEdit({ ...empty }); }}>+ Источник</Button>}>
        <Table
          columns={[
            { key: 'name', header: 'Название', render: (s: SourceRow) => (
                <span><strong>{s.name}</strong>{s.note ? <div style={{ fontSize: 11.5, color: '#889' }}>{s.note}</div> : null}</span>
              ) },
            { key: 'kind', header: 'Тип', render: (s) => <Badge variant="info">{KIND_LABEL[s.kind] ?? s.kind}</Badge> },
            { key: 'url', header: 'URL', render: (s) => s.baseUrl ? <code style={{ fontSize: 12, fontFamily: 'var(--font-mono,monospace)' }}>{s.baseUrl}</code> : <span style={{ color: '#bbb' }}>—</span> },
            { key: 'prio', header: 'Приоритет', align: 'right', render: (s) => s.priority },
            { key: 'trust', header: 'Доверие', align: 'right', render: (s) => `${s.trustScore}/10` },
            { key: 'active', header: 'Статус', render: (s) => s.active
                ? <Badge variant="success" withDot>активен</Badge>
                : <Badge variant="default" withDot>выключен</Badge> },
            { key: 'act', header: '', align: 'right', render: (s) => (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Редактировать</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => toggleSource(s.id, !s.active))}>
                    {s.active ? 'Выключить' : 'Включить'}
                  </Button>
                </div>
              ) },
          ]}
          rows={sources}
          getRowKey={(s) => s.id}
          emptyState={<EmptyState title="Нет источников" description="Добавьте источник подбора." />}
        />
      </Card>

      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title={edit.id ? `Источник — ${edit.name}` : 'Новый источник'}
          footer={<>
            {edit.id && (
              <Button variant="danger" disabled={busy} style={{ marginRight: 'auto' }}
                onClick={async () => { if (confirm('Удалить источник?') && await run(() => deleteSource(edit.id!))) setEdit(null); }}>Удалить</Button>
            )}
            <Button variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
            <Button disabled={busy} onClick={save}>Сохранить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Название" value={edit.name} autoFocus style={{ flex: 2 }} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <Select label="Тип" value={edit.kind} options={KIND_OPTS} style={{ width: 200 }} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} />
            </div>
            {edit.kind !== 'catalog_db' && (
              <>
                <Input label="Базовый URL" value={edit.baseUrl} hint="Напр. https://wellmix-pump.ru/api/"
                  onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })} />
                <Input label="Токен / ключ (секрет)" value={edit.token} hint="Хранится в БД; для Wellmix — реальный api-токен клиента"
                  onChange={(e) => setEdit({ ...edit, token: e.target.value })} />
              </>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Приоритет" value={edit.priority} style={{ width: 140 }} hint="меньше = раньше"
                onChange={(e) => setEdit({ ...edit, priority: e.target.value })} />
              <Input label="Доверие (1–10)" value={edit.trustScore} style={{ width: 140 }}
                onChange={(e) => setEdit({ ...edit, trustScore: e.target.value })} />
            </div>
            <Input label="Заметка" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
