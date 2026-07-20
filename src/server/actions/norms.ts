'use server';

/**
 * Библиотека норм (СП/ГОСТ) — только супер-админ. Нормы общие для платформы;
 * на них ссылаются шаги/инструкции токеном {{norm:код#якорь}}. Правка ГОСТа —
 * здесь, в одном месте; текст инструкций не трогается.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };
const done = (): ActionResult => {
  revalidatePath('/admin/norms');
  return { ok: true };
};

export interface NormAnchor { key: string; label: string; value?: string }
export interface AdminNorm {
  id: string;
  code: string;
  version: string | null;
  status: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
  anchors: NormAnchor[];
}

function toAnchors(content: unknown): NormAnchor[] {
  if (!content || typeof content !== 'object') return [];
  return Object.entries(content as Record<string, { label?: string; value?: string }>).map(([key, v]) => ({
    key,
    label: v?.label ?? key,
    value: typeof v?.value === 'string' ? v.value : undefined,
  }));
}
function fromAnchors(anchors: NormAnchor[]): Record<string, { label: string; value?: string }> {
  const out: Record<string, { label: string; value?: string }> = {};
  for (const a of anchors) {
    const key = a.key.trim();
    if (key) out[key] = { label: a.label.trim() || key, ...(a.value?.trim() ? { value: a.value.trim() } : {}) };
  }
  return out;
}

export async function listNorms(): Promise<AdminNorm[]> {
  await requireSuperAdmin();
  const rows = await db.norm.findMany({ orderBy: [{ category: 'asc' }, { code: 'asc' }] });
  return rows.map((n) => ({
    id: n.id, code: n.code, version: n.version, status: n.status, title: n.title,
    category: n.category, summary: n.summary, url: n.url, anchors: toAnchors(n.content),
  }));
}

export async function createNorm(input: { code: string; title: string; category: string; version?: string; url?: string }): Promise<ActionResult> {
  await requireSuperAdmin();
  const code = input.code?.trim();
  const title = input.title?.trim();
  if (!code) return { ok: false, error: 'Укажите код (напр. СП 8.13130.2020)' };
  if (!title) return { ok: false, error: 'Укажите название' };
  const exists = await db.norm.findUnique({ where: { code } });
  if (exists) return { ok: false, error: `Норма «${code}» уже есть` };
  await db.norm.create({
    data: { code, title, category: input.category?.trim() || 'common', version: input.version?.trim() || null, url: input.url?.trim() || null },
  });
  return done();
}

export async function updateNorm(id: string, input: {
  title: string; category: string; version?: string; summary?: string; url?: string; anchors: NormAnchor[];
}): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!input.title?.trim()) return { ok: false, error: 'Название не может быть пустым' };
  await db.norm.update({
    where: { id },
    data: {
      title: input.title.trim(),
      category: input.category?.trim() || 'common',
      version: input.version?.trim() || null,
      summary: input.summary?.trim() || null,
      url: input.url?.trim() || null,
      content: fromAnchors(input.anchors) as object,
    },
  });
  return done();
}

export async function setNormStatus(id: string, status: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.norm.update({ where: { id }, data: { status: status === 'superseded' ? 'superseded' : 'active' } });
  return done();
}

export async function deleteNorm(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.norm.delete({ where: { id } });
  return done();
}
