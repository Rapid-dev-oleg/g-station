'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, Badge, Input, Select, Table, Tabs, Modal, EmptyState,
} from '@/components/ui';
import {
  createWorkspace, renameWorkspace, setWorkspaceActive,
  createUser, resetUserPassword, setUserSuperAdmin, setUserActive,
  addMember, removeMember,
  type AdminWorkspace, type AdminUser, type ActionResult,
} from '@/server/actions/admin';

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: 'Руководитель', ENGINEER: 'Инженер', MANAGER: 'Менеджер',
};
const ROLE_OPTS = [
  { value: 'DIRECTOR', label: 'Руководитель' },
  { value: 'ENGINEER', label: 'Инженер' },
  { value: 'MANAGER', label: 'Менеджер' },
];

interface Props { workspaces: AdminWorkspace[]; users: AdminUser[] }

export function AdminManager({ workspaces, users }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'workspaces' | 'users'>('workspaces');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // модалки
  const [wsModal, setWsModal] = useState<{ id?: string; name: string; inn: string } | null>(null);
  const [userModal, setUserModal] = useState<{ name: string; email: string; password: string } | null>(null);
  const [pwdModal, setPwdModal] = useState<{ userId: string; name: string; password: string } | null>(null);
  const [membersOf, setMembersOf] = useState<AdminWorkspace | null>(null);
  const [accessOf, setAccessOf] = useState<AdminUser | null>(null);
  // формы добавления доступа
  const [addForm, setAddForm] = useState<{ key: string; role: string }>({ key: '', role: 'ENGINEER' });

  async function run(fn: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    router.refresh();
    return true;
  }

  // ── Вкладка: воркспейсы ─────────────────────────────────────────────────
  const wsTab = (
    <Card
      title="Воркспейсы"
      subtitle="Компании-арендаторы. Данные каждой изолируются по воркспейсу."
      action={<Button size="sm" onClick={() => setWsModal({ name: '', inn: '' })}>+ Создать воркспейс</Button>}
    >
      <Table
        columns={[
          { key: 'name', header: 'Название', render: (w: AdminWorkspace) => <strong>{w.name}</strong> },
          { key: 'inn', header: 'ИНН', render: (w) => w.inn || '—' },
          { key: 'members', header: 'Участники', align: 'right', render: (w) => w.memberCount },
          { key: 'status', header: 'Статус', render: (w) => w.isActive
              ? <Badge variant="success" withDot>активен</Badge>
              : <Badge variant="default" withDot>выключен</Badge> },
          { key: 'act', header: '', align: 'right', render: (w) => (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" onClick={() => setMembersOf(w)}>Участники</Button>
                <Button size="sm" variant="ghost" onClick={() => setWsModal({ id: w.id, name: w.name, inn: w.inn ?? '' })}>Переименовать</Button>
                <Button size="sm" variant={w.isActive ? 'ghost' : 'secondary'} disabled={busy}
                  onClick={() => run(() => setWorkspaceActive(w.id, !w.isActive))}>
                  {w.isActive ? 'Выключить' : 'Включить'}
                </Button>
              </div>
            ) },
        ]}
        rows={workspaces}
        getRowKey={(w) => w.id}
        emptyState={<EmptyState title="Нет воркспейсов" description="Создайте первый воркспейс." />}
      />
    </Card>
  );

  // ── Вкладка: пользователи ───────────────────────────────────────────────
  const usersTab = (
    <Card
      title="Пользователи"
      subtitle="Все учётные записи платформы. Роль назначается в разделе «Доступы»."
      action={<Button size="sm" onClick={() => setUserModal({ name: '', email: '', password: '' })}>+ Создать пользователя</Button>}
    >
      <Table
        columns={[
          { key: 'name', header: 'Имя', render: (u: AdminUser) => (
              <div><strong>{u.name}</strong>{u.isSuperAdmin && <> <Badge variant="brand" size="md">супер-админ</Badge></>}</div>
            ) },
          { key: 'email', header: 'Email', render: (u) => u.email },
          { key: 'ws', header: 'Воркспейсы', render: (u) => u.memberships.length
              ? u.memberships.map((m) => `${m.workspaceName} · ${ROLE_LABEL[m.role]}`).join(', ')
              : '—' },
          { key: 'status', header: 'Статус', render: (u) => u.isActive
              ? <Badge variant="success" withDot>активен</Badge>
              : <Badge variant="danger" withDot>заблокирован</Badge> },
          { key: 'act', header: '', align: 'right', render: (u) => (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button size="sm" variant="ghost" onClick={() => setAccessOf(u)}>Доступы</Button>
                <Button size="sm" variant="ghost" onClick={() => setPwdModal({ userId: u.id, name: u.name, password: '' })}>Сброс пароля</Button>
                <Button size="sm" variant="ghost" disabled={busy}
                  onClick={() => run(() => setUserSuperAdmin(u.id, !u.isSuperAdmin))}>
                  {u.isSuperAdmin ? 'Снять супер-админа' : 'Сделать супер-админом'}
                </Button>
                <Button size="sm" variant={u.isActive ? 'ghost' : 'secondary'} disabled={busy}
                  onClick={() => run(() => setUserActive(u.id, !u.isActive))}>
                  {u.isActive ? 'Заблокировать' : 'Разблокировать'}
                </Button>
              </div>
            ) },
        ]}
        rows={users}
        getRowKey={(u) => u.id}
        emptyState={<EmptyState title="Нет пользователей" description="Создайте первого пользователя." />}
      />
    </Card>
  );

  // участники конкретного воркспейса
  const wsMembers = membersOf ? users.filter((u) => u.memberships.some((m) => m.workspaceId === membersOf.id)) : [];
  const wsNonMembers = membersOf ? users.filter((u) => !u.memberships.some((m) => m.workspaceId === membersOf.id)) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Управление доступом</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #667)' }}>
          Воркспейсы, пользователи и роли. Раздел доступен только супер-администратору.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>
          {error}
        </div>
      )}

      <Tabs
        tabs={[
          { key: 'workspaces', label: 'Воркспейсы', count: workspaces.length },
          { key: 'users', label: 'Пользователи', count: users.length },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'workspaces' | 'users')}
      />

      {tab === 'workspaces' ? wsTab : usersTab}

      {/* Модалка: создать/переименовать воркспейс */}
      {wsModal && (
        <Modal open onClose={() => setWsModal(null)} title={wsModal.id ? 'Переименовать воркспейс' : 'Новый воркспейс'}
          footer={<>
            <Button variant="ghost" onClick={() => setWsModal(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              const ok = await run(() => wsModal.id
                ? renameWorkspace(wsModal.id, wsModal.name)
                : createWorkspace({ name: wsModal.name, inn: wsModal.inn }));
              if (ok) setWsModal(null);
            }}>Сохранить</Button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Название" value={wsModal.name} autoFocus
              onChange={(e) => setWsModal({ ...wsModal, name: e.target.value })} />
            {!wsModal.id && (
              <Input label="ИНН (необязательно)" value={wsModal.inn}
                onChange={(e) => setWsModal({ ...wsModal, inn: e.target.value })} />
            )}
          </div>
        </Modal>
      )}

      {/* Модалка: создать пользователя */}
      {userModal && (
        <Modal open onClose={() => setUserModal(null)} title="Новый пользователь"
          footer={<>
            <Button variant="ghost" onClick={() => setUserModal(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              const ok = await run(() => createUser(userModal));
              if (ok) setUserModal(null);
            }}>Создать</Button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Имя" value={userModal.name} autoFocus
              onChange={(e) => setUserModal({ ...userModal, name: e.target.value })} />
            <Input label="Email" type="email" value={userModal.email}
              onChange={(e) => setUserModal({ ...userModal, email: e.target.value })} />
            <Input label="Временный пароль" value={userModal.password} hint="Минимум 6 символов"
              onChange={(e) => setUserModal({ ...userModal, password: e.target.value })} />
          </div>
        </Modal>
      )}

      {/* Модалка: сброс пароля */}
      {pwdModal && (
        <Modal open onClose={() => setPwdModal(null)} title={`Сброс пароля — ${pwdModal.name}`}
          footer={<>
            <Button variant="ghost" onClick={() => setPwdModal(null)}>Отмена</Button>
            <Button disabled={busy} onClick={async () => {
              const ok = await run(() => resetUserPassword(pwdModal.userId, pwdModal.password));
              if (ok) setPwdModal(null);
            }}>Сохранить</Button>
          </>}
        >
          <Input label="Новый пароль" value={pwdModal.password} autoFocus hint="Минимум 6 символов"
            onChange={(e) => setPwdModal({ ...pwdModal, password: e.target.value })} />
        </Modal>
      )}

      {/* Модалка: участники воркспейса */}
      {membersOf && (
        <Modal open size="lg" onClose={() => { setMembersOf(null); setAddForm({ key: '', role: 'ENGINEER' }); }}
          title={`Участники — ${membersOf.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {wsMembers.length === 0 && <p style={{ color: '#889', margin: 0 }}>Пока нет участников.</p>}
            {wsMembers.map((u) => {
              const m = u.memberships.find((x) => x.workspaceId === membersOf.id)!;
              return (
                <div key={u.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><strong>{u.name}</strong> <span style={{ color: '#889' }}>{u.email}</span></div>
                  <Select style={{ width: 160 }} options={ROLE_OPTS} value={m.role} disabled={busy}
                    onChange={(e) => run(() => addMember({ userId: u.id, workspaceId: membersOf.id, role: e.target.value }))} />
                  <Button size="sm" variant="danger" disabled={busy}
                    onClick={() => run(() => removeMember({ userId: u.id, workspaceId: membersOf.id }))}>Убрать</Button>
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid var(--border,#e5e7eb)', paddingTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <Select label="Добавить участника" style={{ flex: 1 }}
                placeholder={wsNonMembers.length ? 'Выберите пользователя' : 'Все уже добавлены'}
                options={wsNonMembers.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))}
                value={addForm.key} onChange={(e) => setAddForm({ ...addForm, key: e.target.value })} />
              <Select label="Роль" style={{ width: 150 }} options={ROLE_OPTS}
                value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} />
              <Button disabled={busy || !addForm.key} onClick={async () => {
                const ok = await run(() => addMember({ userId: addForm.key, workspaceId: membersOf.id, role: addForm.role }));
                if (ok) setAddForm({ key: '', role: 'ENGINEER' });
              }}>Добавить</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Модалка: доступы пользователя */}
      {accessOf && (() => {
        const joined = new Set(accessOf.memberships.map((m) => m.workspaceId));
        const free = workspaces.filter((w) => !joined.has(w.id));
        return (
          <Modal open size="lg" onClose={() => { setAccessOf(null); setAddForm({ key: '', role: 'ENGINEER' }); }}
            title={`Доступы — ${accessOf.name}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {accessOf.memberships.length === 0 && <p style={{ color: '#889', margin: 0 }}>Не состоит ни в одном воркспейсе.</p>}
              {accessOf.memberships.map((m) => (
                <div key={m.workspaceId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><strong>{m.workspaceName}</strong></div>
                  <Select style={{ width: 160 }} options={ROLE_OPTS} value={m.role} disabled={busy}
                    onChange={(e) => run(() => addMember({ userId: accessOf.id, workspaceId: m.workspaceId, role: e.target.value }))} />
                  <Button size="sm" variant="danger" disabled={busy}
                    onClick={() => run(() => removeMember({ userId: accessOf.id, workspaceId: m.workspaceId }))}>Убрать</Button>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border,#e5e7eb)', paddingTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <Select label="Добавить в воркспейс" style={{ flex: 1 }}
                  placeholder={free.length ? 'Выберите воркспейс' : 'Уже во всех'}
                  options={free.map((w) => ({ value: w.id, label: w.name }))}
                  value={addForm.key} onChange={(e) => setAddForm({ ...addForm, key: e.target.value })} />
                <Select label="Роль" style={{ width: 150 }} options={ROLE_OPTS}
                  value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} />
                <Button disabled={busy || !addForm.key} onClick={async () => {
                  const ok = await run(() => addMember({ userId: accessOf.id, workspaceId: addForm.key, role: addForm.role }));
                  if (ok) setAddForm({ key: '', role: 'ENGINEER' });
                }}>Добавить</Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
