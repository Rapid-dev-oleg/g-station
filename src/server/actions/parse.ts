'use server';

/**
 * Server actions для шага 1 — парсинг пакета документов ТЗ.
 *
 * Поток: один или несколько загруженных файлов → извлечение текста каждого →
 * склейка с заголовками → разбор ИИ → карточка параметров.
 *
 * Два режима ответа:
 *  - review — карточка с пропусками: показать инженеру форму редактирования;
 *  - redirect — все обязательные поля извлечены: автосабмит создал клиента/
 *    проект/систему, прогнал расчёт, вернул URL страницы расчёта.
 */

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createEmptyDossier } from '@/lib/dossier/factory';
import type { Dossier, Meta, StationInput } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { scrubInput, scrubMeta } from '@/lib/dossier/scrub';
import { type DocFormat } from '@/server/ai/extract-text';
import {
  parseDocumentViaAgent,
  type ParsedClient,
  type ParsedDocument,
} from '@/server/ai/parse-document';
import { db } from '@/server/db';

// ─── Типы ответов ────────────────────────────────────────────────────────

/** Одна загруженная единица — для отображения в UI и при коммите. */
export interface ParsedFileInfo {
  filename: string;
  format: DocFormat;
  /** Размер исходного файла в байтах. */
  size: number;
}

/** Результат парсинга — для экрана ревью. */
export interface ParseResult extends ParsedDocument {
  /** Список исходных файлов пакета. */
  files: ParsedFileInfo[];
  /** Найденный в базе клиент (совпадение по названию/ИНН) или null. */
  matchedClient: {
    id: string;
    shortName: string;
    fullName: string | null;
    inn: string | null;
  } | null;
}

/** Ответ парсинга с автосабмитом. */
export type ParseResponse =
  | { ok: true; mode: 'review'; result: ParseResult }
  | { ok: true; mode: 'redirect'; redirect: string }
  | { ok: true; mode: 'job'; jobId: string }
  | { ok: false; error: string };

// ─── Лимиты ──────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_TOTAL_SIZE = 400 * 1024 * 1024;
const MAX_FILES = 10;

// ─── Подготовка пакета файлов для агента ─────────────────────────────────

/** Формат файла по расширению (для отображения в UI). */
function formatByExt(name: string): DocFormat {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.xlsx')) return 'xlsx';
  return 'txt';
}

/**
 * Складывает загруженные файлы во временную директорию — её читает Kimi-агент
 * СВОИМИ инструментами (read_media/shell), без локального извлечения текста и
 * рендера в память приложения (это снимало OOM на тяжёлых ПД).
 * Вызывающий обязан удалить `dir` после разбора.
 */
export async function stagePackageToDir(formData: FormData): Promise<{
  dir: string;
  files: ParsedFileInfo[];
}> {
  const raw = [...formData.getAll('files'), ...formData.getAll('file')];
  const inputs = raw.filter((f): f is File => f instanceof File && f.size > 0);

  if (inputs.length === 0) throw new Error('Файлы не выбраны или пусты');
  if (inputs.length > MAX_FILES) {
    throw new Error(`Слишком много файлов: ${inputs.length} (максимум ${MAX_FILES})`);
  }
  let totalSize = 0;
  for (const f of inputs) {
    if (f.size > MAX_FILE_SIZE) {
      throw new Error(`Файл «${f.name}» слишком большой (максимум 200 МБ)`);
    }
    totalSize += f.size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(`Суммарный размер пакета слишком большой (максимум 400 МБ)`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'gstation-tz-'));
  const files: ParsedFileInfo[] = [];
  for (const f of inputs) {
    const buffer = Buffer.from(await f.arrayBuffer());
    await writeFile(join(dir, f.name), buffer);
    files.push({ filename: f.name, format: formatByExt(f.name), size: f.size });
  }
  return { dir, files };
}

// ─── Проверка полноты карточки для автосабмита ───────────────────────────

/**
 * Обязательные поля карточки (по методике pump-station-calc, шаг1-вход.md).
 * Если эти поля заполнены — автосабмит безопасно проходит, иначе показываем ревью.
 *
 * Критичный вход — только purpose, Q, H (без них расчёт не запустить).
 * Схему резервирования, мощность, DN и т.п. определяет расчёт по методике —
 * их НЕ требуем на входе.
 */
function isCardComplete(input: Partial<StationInput>, missing: string[]): boolean {
  if (missing.length > 0) {
    const criticalMissing = missing.some((m) => /^(purpose|Q|H)$/i.test(m.trim()));
    if (criticalMissing) return false;
  }
  if (!input.purpose) return false;
  if (!input.Q || input.Q.value === null || input.Q.value === undefined) return false;
  if (!input.H || input.H.value === null || input.H.value === undefined) return false;
  return true;
}

// ─── Основная точка входа: парсинг (+ возможный автосабмит) ──────────────

/**
 * Парсинг пакета документов ТЗ и, если карточка полная, автосабмит до расчёта.
 *
 * `ownerId` — обязательный аргумент для автосабмита: используется как
 * владелец проекта и инженер системы. Если ownerId не передан, автосабмит
 * не запускается и поток уходит в режим review.
 */
export async function parseUploadedDocument(
  formData: FormData,
  ownerId?: string,
): Promise<ParseResponse> {
  let pkg: { dir: string; files: ParsedFileInfo[] };
  try {
    pkg = await stagePackageToDir(formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка приёма файлов' };
  }
  const lockedProjectId = (formData.get('projectId') as string | null)?.trim() || undefined;
  return runParseJob({
    dir: pkg.dir,
    files: pkg.files,
    ownerId,
    lockedProjectId,
  });
}

/**
 * Сам разбор пакета (для фоновой задачи и синхронного вызова): агент читает
 * файлы из `dir` → карточка → поиск клиента → автосабмит/ревью. Чистит `dir`.
 * `progress` — необязательный колбэк для отчёта в очередь задач.
 */
export async function runParseJob(params: {
  dir: string;
  files: ParsedFileInfo[];
  ownerId?: string;
  lockedProjectId?: string;
  progress?: (pct: number, message?: string) => Promise<void>;
}): Promise<ParseResponse> {
  const { dir, files, ownerId, lockedProjectId, progress } = params;
  let parsed: ParsedDocument;
  try {
    await progress?.(20, `Агент читает файлы (${files.length} шт.)…`);
    parsed = await parseDocumentViaAgent(
      dir,
      files.map((f) => f.filename),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка разбора документа' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  await progress?.(75, 'Сборка карточки и создание проекта…');
  const matchedClient = await matchClient(parsed.client);
  const result: ParseResult = { ...parsed, files, matchedClient };

  // Автосабмит: несколько систем / единственная полная / загрузка в проект.
  const multi = parsed.systems.length > 1;
  const singleComplete =
    parsed.systems.length === 1 &&
    isCardComplete(parsed.systems[0].input, parsed.systems[0].missing);

  if (ownerId && (multi || singleComplete || lockedProjectId)) {
    try {
      const submitted = await autoSubmit({ ownerId, parsed: result, projectId: lockedProjectId });
      if (submitted.ok) {
        const redirect =
          submitted.systemIds.length === 1
            ? `/projects/${submitted.projectId}/systems/${submitted.systemIds[0]}`
            : `/projects/${submitted.projectId}`;
        return { ok: true, mode: 'redirect', redirect };
      }
      console.warn('[parse] autoSubmit failed, falling back to review:', submitted.errors);
    } catch (e) {
      console.warn('[parse] autoSubmit threw, falling back to review:', e);
    }
  }

  return { ok: true, mode: 'review', result };
}

/**
 * Алиас для семантической ясности: вызов с автосабмитом всегда требует ownerId.
 * Возвращает либо redirect, либо review. Используется UI'ем напрямую.
 */
export async function parseAndAutoSubmit(
  formData: FormData,
  ownerId: string,
): Promise<ParseResponse> {
  return parseUploadedDocument(formData, ownerId);
}

// ─── Поиск клиента в базе ────────────────────────────────────────────────

/**
 * Ищет существующего клиента по совпадению ИНН или названия.
 * ИНН — точное совпадение (приоритет); название — без учёта регистра
 * и кавычек. Возвращает найденного клиента или null.
 */
export async function matchClient(
  parsed: ParsedClient | null,
): Promise<ParseResult['matchedClient']> {
  if (!parsed) return null;

  // 1. Точное совпадение по ИНН.
  if (parsed.inn) {
    const byInn = await db.client.findFirst({ where: { inn: parsed.inn } });
    if (byInn) {
      return {
        id: byInn.id,
        shortName: byInn.shortName,
        fullName: byInn.fullName,
        inn: byInn.inn,
      };
    }
  }

  // 2. Совпадение по названию (краткое или полное), без регистра.
  const norm = (s: string) =>
    s.toLowerCase().replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
  const target = norm(parsed.shortName);
  const fullTarget = parsed.fullName ? norm(parsed.fullName) : null;

  const candidates = await db.client.findMany({
    where: {
      OR: [
        { shortName: { contains: parsed.shortName, mode: 'insensitive' } },
        ...(parsed.fullName
          ? [{ fullName: { contains: parsed.fullName, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    take: 20,
  });

  const hit = candidates.find((c) => {
    const cShort = norm(c.shortName);
    const cFull = c.fullName ? norm(c.fullName) : '';
    return (
      cShort === target ||
      cShort.includes(target) ||
      target.includes(cShort) ||
      (fullTarget !== null && (cFull === fullTarget || cFull.includes(fullTarget)))
    );
  });

  if (!hit) return null;
  return {
    id: hit.id,
    shortName: hit.shortName,
    fullName: hit.fullName,
    inn: hit.inn,
  };
}

// ─── Автосабмит: клиент → проект → система → расчёт ──────────────────────

const FALLBACK_CLIENT_SHORT_NAME = 'Без клиента';

/**
 * Гарантирует наличие фолбэк-клиента «Без клиента» — он нужен, когда в ТЗ
 * нет реквизитов заказчика, но Project.clientId по схеме обязателен.
 * Идемпотентно: ищет по shortName, создаёт если нет.
 */
async function ensureFallbackClient(): Promise<string> {
  const existing = await db.client.findFirst({
    where: { shortName: FALLBACK_CLIENT_SHORT_NAME },
  });
  if (existing) return existing.id;
  const created = await db.client.create({
    data: {
      shortName: FALLBACK_CLIENT_SHORT_NAME,
      note: 'Технический клиент-фолбэк для автосабмита (когда реквизиты не извлечены)',
    },
  });
  return created.id;
}

/**
 * Разрешает clientId для автосабмита:
 *  - найден в базе → existing;
 *  - распознан в ТЗ → создаём нового;
 *  - нет данных → фолбэк-клиент «Без клиента».
 */
async function resolveClientId(
  parsed: ParsedClient | null,
  matched: ParseResult['matchedClient'],
): Promise<string> {
  if (matched) return matched.id;

  if (parsed && parsed.shortName.trim()) {
    const created = await db.client.create({
      data: {
        shortName: parsed.shortName.trim(),
        fullName: parsed.fullName?.trim() || null,
        inn: parsed.inn?.trim() || null,
        contactName: parsed.contactName?.trim() || null,
        phone: parsed.phone?.trim() || null,
        email: parsed.email?.trim() || null,
        note: 'Создан автосабмитом при разборе ТЗ',
      },
    });
    return created.id;
  }

  return ensureFallbackClient();
}

interface AutoSubmitParams {
  ownerId: string;
  parsed: ParseResult;
  /** Привязать к существующему проекту (иначе создаётся новый). */
  projectId?: string;
}

type AutoSubmitOutcome =
  | { ok: true; projectId: string; systemIds: string[] }
  | { ok: false; errors: string[] };

/**
 * Автосабмит: создаёт клиента (если нужно), проект (или использует
 * существующий) и ВСЕ системы из ТЗ (parsed.systems). Расчёт не запускается —
 * системы создаются со статусом INPUT, инженер считает через Kimi в степпере.
 */
async function autoSubmit({
  ownerId,
  parsed,
  projectId,
}: AutoSubmitParams): Promise<AutoSubmitOutcome> {
  // 1. Проект: существующий или новый.
  let project: { id: string };
  if (projectId) {
    const existing = await db.project.findUnique({ where: { id: projectId } });
    if (!existing) return { ok: false, errors: ['Проект не найден'] };
    project = existing;
  } else {
    const clientId = await resolveClientId(parsed.client, parsed.matchedClient);
    const objectName = parsed.meta.object_name?.trim() || 'Объект не указан';
    const projectName = parsed.meta.object_name
      ? `${parsed.meta.object_name.trim()} — насосные станции`
      : `Расчёт из ТЗ (${new Date().toLocaleDateString('ru-RU')})`;
    project = await db.project.create({
      data: {
        name: projectName,
        objectName,
        clientId,
        ownerId,
        deadline: parsed.meta.deadline ? safeDate(parsed.meta.deadline) : null,
      },
    });
  }

  // 2. Создаём по системе на каждый элемент parsed.systems.
  const systemIds: string[] = [];
  const errors: string[] = [];
  for (const sys of parsed.systems) {
    const base = createEmptyDossier(sys.systemName);
    const dossier: Dossier = {
      meta: { ...base.meta, ...scrubMeta(parsed.meta) },
      stations: [
        {
          ...base.stations[0],
          input: {
            ...base.stations[0].input,
            ...scrubInput(sys.input as Record<string, unknown>),
          } as StationInput,
        },
      ],
    };
    const check = validateDossier(dossier);
    if (!check.valid) {
      errors.push(`${sys.systemName}: ${check.errors.join('; ')}`);
      continue;
    }
    const created = await db.system.create({
      data: {
        name: sys.systemName,
        projectId: project.id,
        // typeCode уже определён парсером по реестру SystemType (READY-тип).
        typeCode: sys.typeCode,
        engineerId: ownerId,
        dossier: dossier as unknown as Prisma.InputJsonValue,
      },
    });
    systemIds.push(created.id);
  }

  if (systemIds.length === 0) {
    return { ok: false, errors: errors.length ? errors : ['Не создано ни одной системы'] };
  }

  revalidatePath('/projects');
  revalidatePath(`/projects/${project.id}`);
  return { ok: true, projectId: project.id, systemIds };
}

/**
 * Безопасный парсер строки даты из ТЗ.
 * Часто там бессмысленный текст («до конца года»). Возвращает null,
 * если строку нельзя превратить в Date.
 */
function safeDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Очистка карточек от null'ов вынесена в `@/lib/dossier/scrub`
 * (server-action может экспортировать только async-функции).
 */

// ─── Подтверждение разбора инженером (ручной путь, после ревью) ──────────

/** Параметры для подтверждения разбора инженером (после гейта 1). */
export interface CommitIntakeInput {
  /** Идентификатор инженера-владельца. */
  ownerId: string;
  /** Клиент: существующий (id) или новый (данные) или без клиента. */
  client:
    | { mode: 'existing'; id: string }
    | { mode: 'new'; data: ParsedClient }
    | { mode: 'none' };
  /** Проект: существующий (id) или новый. */
  project:
    | { mode: 'existing'; id: string }
    | { mode: 'new'; name: string; objectName: string; deadline?: string | null };
  /** Название создаваемой системы. */
  systemName: string;
  /** Отредактированная инженером карточка параметров. */
  meta: Partial<Meta>;
  input: StationInput;
}

export type CommitResponse =
  | { ok: true; projectId: string; systemId: string }
  | { ok: false; errors: string[] };

/**
 * Подтверждение разбора (гейт 1): при необходимости создаёт `Client` и
 * `Project`, создаёт `System` типа fire и записывает карточку в dossier.
 * Дело валидируется по JSON Schema перед записью.
 */
export async function commitIntake(
  data: CommitIntakeInput,
): Promise<CommitResponse> {
  // Клиент без привязки невозможен в схеме — проект требует clientId.
  // Если клиент не задан, но создаётся новый проект — это ошибка потока.
  let clientId: string | null = null;
  if (data.client.mode === 'existing') {
    clientId = data.client.id;
  } else if (data.client.mode === 'new') {
    const created = await db.client.create({
      data: {
        shortName: data.client.data.shortName,
        fullName: data.client.data.fullName,
        inn: data.client.data.inn,
        contactName: data.client.data.contactName,
        phone: data.client.data.phone,
        email: data.client.data.email,
        note: 'Создан при разборе документа ТЗ',
      },
    });
    clientId = created.id;
  } else {
    // Режим none + новый проект — используем фолбэк-клиента.
    if (data.project.mode === 'new') {
      clientId = await ensureFallbackClient();
    }
  }

  // Проект.
  let projectId: string;
  if (data.project.mode === 'existing') {
    projectId = data.project.id;
  } else {
    if (!clientId) {
      return {
        ok: false,
        errors: ['Для создания нового проекта нужно выбрать или создать клиента'],
      };
    }
    const project = await db.project.create({
      data: {
        name: data.project.name,
        objectName: data.project.objectName,
        clientId,
        ownerId: data.ownerId,
        deadline: data.project.deadline ? safeDate(data.project.deadline) : null,
      },
    });
    projectId = project.id;
  }

  // Собираем расчётное дело: пустой каркас + карточка из разбора.
  const base = createEmptyDossier(data.systemName);
  const dossier: Dossier = {
    meta: { ...base.meta, ...scrubMeta(data.meta) },
    stations: [
      {
        ...base.stations[0],
        input: {
          ...base.stations[0].input,
          ...scrubInput(data.input as unknown as Record<string, unknown>),
        } as StationInput,
      },
    ],
  };

  const check = validateDossier(dossier);
  if (!check.valid) {
    return { ok: false, errors: check.errors };
  }

  const system = await db.system.create({
    data: {
      name: data.systemName,
      projectId,
      typeCode: 'fire',
      engineerId: data.ownerId,
      dossier: dossier as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId, systemId: system.id };
}
