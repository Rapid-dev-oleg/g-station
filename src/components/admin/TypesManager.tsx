'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SystemTypeStatus } from '@prisma/client';
import { Button, Card, Badge, Input, Select, Textarea, Table, Modal, EmptyState } from '@/components/ui';
import {
  createCalcType, updateCalcTypeIdentity,
  type CalcTypeRow, type ActionResult,
} from '@/server/actions/calc-types';

const STATUS_OPTS = [
  { value: 'PLANNED', label: 'Черновик (не в проде)' },
  { value: 'READY', label: 'Готов (доступен в проде)' },
];
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

interface EditState {
  code: string;
  name: string;
  status: SystemTypeStatus;
  description: string;
  skillName: string;
  typeModule: string;
  triggers: string;
  purposes: string;
  components: string;
}

export function TypesManager({ types }: { types: CalcTypeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ code: string; name: string } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  const openEdit = (t: CalcTypeRow) =>
    setEdit({
      code: t.code, name: t.name, status: t.status,
      description: t.description ?? '', skillName: t.skillName ?? '', typeModule: t.typeModule ?? '',
      triggers: t.triggers.join('\n'), purposes: t.purposes.join('\n'), components: t.components.join('\n'),
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Конструктор типов расчёта</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted,#667)' }}>
          Типы станций и их схемы ввода. Новый тип = данные, без правок кода.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card
        title="Типы расчёта"
        subtitle="Идентификация типа (раздел 1 контракта) и активная схема ввода"
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
              key: 'schema', header: 'Активная схема', render: (t) => t.activeSchema
                ? <span>v{t.activeSchema.version} · {t.activeSchema.fieldCount} полей</span>
                : <span style={{ color: '#c98a1e' }}>нет схемы</span>,
            },
            {
              key: 'triggers', header: 'Триггеры', render: (t) =>
                <span style={{ color: '#889' }}>{t.triggers.slice(0, 4).join(', ') || '—'}{t.triggers.length > 4 ? '…' : ''}</span>,
            },
            {
              key: 'act', header: '', align: 'right', render: (t) => (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Идентичность</Button>
                  <Button size="sm" variant="secondary" disabled title="Редактор схемы — следующий шаг (B2)">
                    Схема{t.activeSchema ? ` · ${t.activeSchema.fieldCount} полей` : ''}
                  </Button>
                </div>
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

      {/* Редактировать идентичность */}
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title={`Идентичность типа — ${edit.name}`}
          footer={<>
            <Button variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              const okr = await run(() => updateCalcTypeIdentity(edit.code, {
                name: edit.name, status: edit.status, description: edit.description,
                skillName: edit.skillName, typeModule: edit.typeModule,
                triggers: lines(edit.triggers), purposes: lines(edit.purposes), components: lines(edit.components),
              }));
              if (okr) setEdit(null);
            }}>Сохранить</Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Название" value={edit.name} style={{ flex: 1 }}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <Select label="Статус" style={{ width: 220 }} options={STATUS_OPTS} value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value as SystemTypeStatus })} />
            </div>
            <Textarea label="Описание" value={edit.description} rows={2}
              onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Скил" value={edit.skillName} style={{ flex: 1 }} hint="напр. pump-station-calc"
                onChange={(e) => setEdit({ ...edit, skillName: e.target.value })} />
              <Input label="Модуль типа" value={edit.typeModule} style={{ flex: 1 }} hint="напр. типы/пожарные.md"
                onChange={(e) => setEdit({ ...edit, typeModule: e.target.value })} />
            </div>
            <Textarea label="Триггеры (по одному в строке)" value={edit.triggers} rows={3}
              hint="Ключевые слова ТЗ, по которым станция относится к этому типу"
              onChange={(e) => setEdit({ ...edit, triggers: e.target.value })} />
            <Textarea label="Назначения (по одному в строке)" value={edit.purposes} rows={2}
              onChange={(e) => setEdit({ ...edit, purposes: e.target.value })} />
            <Textarea label="Компоненты (по одному в строке)" value={edit.components} rows={2}
              hint="Что считать компонентом станции, а не отдельной системой"
              onChange={(e) => setEdit({ ...edit, components: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
