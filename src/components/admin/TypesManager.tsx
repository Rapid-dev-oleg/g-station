'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Table, Modal, EmptyState } from '@/components/ui';
import { createCalcType, type CalcTypeRow, type ActionResult } from '@/server/actions/calc-types';

export function TypesManager({ types }: { types: CalcTypeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ code: string; name: string } | null>(null);

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Типы расчёта</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted,#667)' }}>
          Типы станций и их схемы. Открой тип → вкладки «Схема» и «Степы».
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card
        title="Типы"
        action={<Button size="sm" onClick={() => setCreating({ code: '', name: '' })}>+ Новый тип</Button>}
      >
        <Table
          columns={[
            {
              key: 'name', header: 'Тип', render: (t: CalcTypeRow) => (
                <div>
                  <strong>{t.name}</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono,monospace)', color: '#889', fontSize: 12 }}>{t.code}</span>
                </div>
              ),
            },
            {
              key: 'status', header: 'Статус', render: (t) => t.status === 'READY'
                ? <Badge variant="success" withDot>готов</Badge>
                : <Badge variant="warning" withDot>черновик</Badge>,
            },
            {
              key: 'schema', header: 'Схема', render: (t) => t.activeSchema
                ? <span>{t.activeSchema.fieldCount} полей</span>
                : <span style={{ color: '#c98a1e' }}>нет</span>,
            },
            {
              key: 'act', header: '', align: 'right', render: (t) => (
                <Button size="sm" onClick={() => router.push(`/admin/types/${t.code}`)}>Открыть</Button>
              ),
            },
          ]}
          rows={types}
          getRowKey={(t) => t.code}
          emptyState={<EmptyState title="Нет типов" description="Создайте первый тип расчёта." />}
        />
      </Card>

      {/* Создать тип */}
      {creating && (
        <Modal open onClose={() => setCreating(null)} title="Новый тип расчёта"
          footer={<>
            <Button variant="ghost" onClick={() => setCreating(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              if (await run(() => createCalcType(creating))) setCreating(null);
            }}>Создать</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Код (латиница)" value={creating.code} autoFocus hint="Напр. water, drain — уникальный идентификатор"
              onChange={(e) => setCreating({ ...creating, code: e.target.value })} />
            <Input label="Название" value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
