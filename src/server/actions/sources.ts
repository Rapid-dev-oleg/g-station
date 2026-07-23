'use server';

/**
 * Реестр источников подбора (Source) — редактируемый из UI. Источники общие для
 * платформы → доступ супер-админу. Тип задаёт способ доступа агента:
 * catalog_db (наш каталог, MCP), api (внешний API, напр. Wellmix — MCP select_pump),
 * web_trusted (доверенный сайт). Приоритет/скоринг — под #11/#14.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };
const done = (): ActionResult => {
  revalidatePath('/admin/sources');
  return { ok: true };
};

const SOURCE_KINDS = ['catalog_db', 'api', 'web_trusted'] as const;
type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceRow {
  id: string;
  name: string;
  kind: string;
  baseUrl: string | null;
  token: string | null;
  config: unknown;
  /** Список адресов каталогов на сайтах (для kind='web_trusted'). */
  catalogUrls: string[];
  priority: number;
  trustScore: number;
  active: boolean;
  note: string | null;
}

export interface SourceInput {
  name: string;
  kind: string;
  baseUrl?: string;
  token?: string;
  /** Адреса каталогов на доверенных сайтах (kind='web_trusted'). */
  catalogUrls?: string[];
  priority?: number;
  trustScore?: number;
  note?: string;
}

function catalogUrlsOf(config: unknown): string[] {
  const c = config as { catalogUrls?: unknown } | null;
  return Array.isArray(c?.catalogUrls) ? c!.catalogUrls.filter((u): u is string => typeof u === 'string' && u.trim() !== '') : [];
}

export async function listSources(): Promise<SourceRow[]> {
  await requireSuperAdmin();
  const rows = await db.source.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] });
  return rows.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, baseUrl: s.baseUrl, token: s.token,
    config: s.config ?? null, catalogUrls: catalogUrlsOf(s.config), priority: s.priority, trustScore: s.trustScore, active: s.active, note: s.note,
  }));
}

function validate(input: SourceInput): string | null {
  if (!input.name?.trim()) return 'Укажите название источника';
  if (!SOURCE_KINDS.includes(input.kind as SourceKind)) return 'Неизвестный тип источника';
  if (input.kind === 'api' && !input.baseUrl?.trim()) return 'Для API укажите базовый URL';
  if (input.kind === 'web_trusted' && !(input.catalogUrls ?? []).some((u) => u.trim())) {
    return 'Добавьте хотя бы один адрес каталога';
  }
  const ts = input.trustScore;
  if (ts != null && (ts < 1 || ts > 10)) return 'Скоринг доверия — от 1 до 10';
  return null;
}

const cleanUrls = (urls?: string[]): string[] => (urls ?? []).map((u) => u.trim()).filter(Boolean);

export async function createSource(input: SourceInput): Promise<ActionResult> {
  await requireSuperAdmin();
  const err = validate(input);
  if (err) return { ok: false, error: err };
  await db.source.create({
    data: {
      name: input.name.trim(), kind: input.kind,
      baseUrl: input.baseUrl?.trim() || null, token: input.token?.trim() || null,
      config: input.kind === 'web_trusted' ? { catalogUrls: cleanUrls(input.catalogUrls) } : undefined,
      priority: input.priority ?? 100, trustScore: input.trustScore ?? 5, note: input.note?.trim() || null,
    },
  });
  return done();
}

export async function updateSource(id: string, input: SourceInput): Promise<ActionResult> {
  await requireSuperAdmin();
  const err = validate(input);
  if (err) return { ok: false, error: err };
  const existing = await db.source.findUnique({ where: { id }, select: { config: true } });
  // web_trusted: пишем список URL в config (сохраняя прочие ключи); иначе config не трогаем.
  const config =
    input.kind === 'web_trusted'
      ? { ...((existing?.config as object) ?? {}), catalogUrls: cleanUrls(input.catalogUrls) }
      : undefined;
  await db.source.update({
    where: { id },
    data: {
      name: input.name.trim(), kind: input.kind,
      baseUrl: input.baseUrl?.trim() || null, token: input.token?.trim() || null,
      ...(config ? { config } : {}),
      priority: input.priority ?? 100, trustScore: input.trustScore ?? 5, note: input.note?.trim() || null,
    },
  });
  return done();
}

export async function toggleSource(id: string, active: boolean): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.source.update({ where: { id }, data: { active } });
  return done();
}

export async function deleteSource(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.source.delete({ where: { id } });
  return done();
}
