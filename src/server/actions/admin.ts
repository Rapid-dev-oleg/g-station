'use server';

/**
 * Управление доступом — только для супер-администратора (страница /admin).
 * Воркспейсы, пользователи, участия (роли в воркспейсах). КАЖДОЕ действие
 * защищено requireSuperAdmin — вызвать в обход UI нельзя.
 */
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };

const ROLES: Role[] = ['DIRECTOR', 'ENGINEER', 'MANAGER'];
function normRole(r: string): Role {
  return (ROLES as string[]).includes(r) ? (r as Role) : 'ENGINEER';
}
const done = (): ActionResult => {
  revalidatePath('/admin');
  return { ok: true };
};

// ─── Данные для страницы ──────────────────────────────────────────────────

export interface AdminWorkspace {
  id: string; name: string; inn: string | null; isActive: boolean; memberCount: number;
}
export interface AdminUser {
  id: string; name: string; email: string; isSuperAdmin: boolean; isActive: boolean;
  memberships: { workspaceId: string; workspaceName: string; role: Role }[];
}

export async function getAdminData(): Promise<{ workspaces: AdminWorkspace[]; users: AdminUser[] }> {
  await requireSuperAdmin();
  const [workspaces, users] = await Promise.all([
    db.workspace.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { memberships: true } } } }),
    db.user.findMany({ orderBy: { createdAt: 'asc' }, include: { memberships: { include: { workspace: true } } } }),
  ]);
  return {
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, inn: w.inn, isActive: w.isActive, memberCount: w._count.memberships })),
    users: users.map((u) => ({
      id: u.id, name: u.name, email: u.email, isSuperAdmin: u.isSuperAdmin, isActive: u.isActive,
      memberships: u.memberships.map((m) => ({ workspaceId: m.workspaceId, workspaceName: m.workspace.name, role: m.role })),
    })),
  };
}

// ─── Воркспейсы ───────────────────────────────────────────────────────────

export async function createWorkspace(input: { name: string; inn?: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'Укажите название воркспейса' };
  await db.workspace.create({ data: { name, inn: input.inn?.trim() || null } });
  return done();
}

export async function renameWorkspace(id: string, name: string): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!name.trim()) return { ok: false, error: 'Название не может быть пустым' };
  await db.workspace.update({ where: { id }, data: { name: name.trim() } });
  return done();
}

export async function setWorkspaceActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.workspace.update({ where: { id }, data: { isActive } });
  return done();
}

// ─── Пользователи ─────────────────────────────────────────────────────────

export async function createUser(input: { name: string; email: string; password: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? '';
  if (!name || !email) return { ok: false, error: 'Заполните имя и email' };
  if (password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' };
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: 'Пользователь с таким email уже есть' };
  await db.user.create({ data: { name, email, passwordHash: bcrypt.hashSync(password, 10) } });
  return done();
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  await requireSuperAdmin();
  if ((password ?? '').length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' };
  await db.user.update({ where: { id: userId }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
  return done();
}

export async function setUserSuperAdmin(userId: string, value: boolean): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (userId === me.id && !value) return { ok: false, error: 'Нельзя снять супер-админа с самого себя' };
  await db.user.update({ where: { id: userId }, data: { isSuperAdmin: value } });
  return done();
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (userId === me.id && !isActive) return { ok: false, error: 'Нельзя деактивировать самого себя' };
  await db.user.update({ where: { id: userId }, data: { isActive } });
  return done();
}

// ─── Доступы (участие в воркспейсе + роль) ────────────────────────────────

export async function addMember(input: { userId: string; workspaceId: string; role: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!input.userId || !input.workspaceId) return { ok: false, error: 'Выберите пользователя и воркспейс' };
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
    update: { role: normRole(input.role) },
    create: { userId: input.userId, workspaceId: input.workspaceId, role: normRole(input.role) },
  });
  return done();
}

export async function setMemberRole(input: { userId: string; workspaceId: string; role: string }): Promise<ActionResult> {
  return addMember(input); // upsert — та же операция
}

export async function removeMember(input: { userId: string; workspaceId: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.membership.deleteMany({ where: { userId: input.userId, workspaceId: input.workspaceId } });
  return done();
}
