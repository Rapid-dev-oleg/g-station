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

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createEmptyDossier } from '@/lib/dossier/factory';
import type { Dossier, Meta, StationInput } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { extractText, type DocFormat } from '@/server/ai/extract-text';
import { documentToImages } from '@/server/ai/document-images';
import type { KimiImage } from '@/server/ai/kimi';
import { parseDocument, type ParsedClient, type ParsedDocument } from '@/server/ai/parse-document';
import { runSystemCalc } from '@/server/actions/calc';
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
  | { ok: false; error: string };

// ─── Лимиты ──────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TOTAL_SIZE = 40 * 1024 * 1024;
const MAX_FILES = 10;

// ─── Извлечение текста пакета файлов ─────────────────────────────────────

/**
 * Принимает FormData с одним или несколькими файлами (ключ `files` или `file`)
 * и склеивает извлечённый текст с заголовками `=== Файл: ... ===`.
 */
async function extractPackage(formData: FormData): Promise<{
  text: string;
  files: ParsedFileInfo[];
  images: KimiImage[];
}> {
  // Совместимость: поддерживаем оба ключа — `files[]` (новый UI) и `file` (legacy).
  const raw = [...formData.getAll('files'), ...formData.getAll('file')];
  const inputs = raw.filter((f): f is File => f instanceof File && f.size > 0);

  if (inputs.length === 0) {
    throw new Error('Файлы не выбраны или пусты');
  }
  if (inputs.length > MAX_FILES) {
    throw new Error(`Слишком много файлов: ${inputs.length} (максимум ${MAX_FILES})`);
  }

  let totalSize = 0;
  for (const f of inputs) {
    if (f.size > MAX_FILE_SIZE) {
      throw new Error(`Файл «${f.name}» слишком большой (максимум 15 МБ)`);
    }
    totalSize += f.size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(`Суммарный размер пакета слишком большой (максимум 40 МБ)`);
  }

  const files: ParsedFileInfo[] = [];
  const parts: string[] = [];
  const images: KimiImage[] = [];
  const errors: string[] = [];
  // Минимальная длина текста на файл, ниже которой считаем его «сканом»
  // и дополнительно отдаём картинки на vision-разбор.
  const MIN_TEXT_LEN = 40;

  for (const f of inputs) {
    const buffer = Buffer.from(await f.arrayBuffer());
    let extractedLen = 0;
    try {
      const { text, format } = await extractText(f.name, buffer);
      extractedLen = text.trim().length;
      if (extractedLen >= MIN_TEXT_LEN) {
        files.push({ filename: f.name, format, size: f.size });
        parts.push(`=== Файл: ${f.name} (${format}) ===\n${text}`);
        continue;
      }
    } catch {
      // Текстовый слой не извлёкся (скан) — упадём в vision-ветку ниже.
    }

    // Текста нет или почти нет → пытаемся извлечь изображения для vision.
    try {
      const imgs = await documentToImages(f.name, buffer);
      if (imgs.length > 0) {
        images.push(...imgs);
        const fmt = f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
        files.push({ filename: f.name, format: fmt as ParsedFileInfo['format'], size: f.size });
      } else {
        errors.push(`«${f.name}»: нет текстового слоя и не удалось извлечь изображения`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`«${f.name}»: ${msg}`);
    }
  }

  if (parts.length === 0 && images.length === 0) {
    throw new Error('Не удалось извлечь ни текст, ни изображения:\n' + errors.join('\n'));
  }

  const text = parts.join('\n\n');
  return { text, files, images };
}

// ─── Проверка полноты карточки для автосабмита ───────────────────────────

/**
 * Обязательные поля карточки (по методике pump-station-calc, шаг1-вход.md).
 * Если эти поля заполнены — автосабмит безопасно проходит, иначе показываем ревью.
 *
 * Используем мягкий список: purpose, Q, H, reservation_scheme — самое
 * критичное (без них расчёт не запустится).
 */
function isCardComplete(input: Partial<StationInput>, missing: string[]): boolean {
  if (missing.length > 0) {
    // Если модель сама пометила что-то как missing — без автосабмита.
    const criticalMissing = missing.some((m) =>
      /^(purpose|Q|H|reservation_scheme|fire_params\.fire_)/i.test(m.trim()),
    );
    if (criticalMissing) return false;
  }
  if (!input.purpose) return false;
  if (!input.reservation_scheme) return false;
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
  // 1. Извлечение текста и/или изображений пакета.
  let pkg: { text: string; files: ParsedFileInfo[]; images: KimiImage[] };
  try {
    pkg = await extractPackage(formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка извлечения текста' };
  }

  // 2. Разбор ИИ: текст и/или сканы (vision через Kimi).
  let parsed: ParsedDocument;
  try {
    parsed = await parseDocument({ text: pkg.text, images: pkg.images });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка разбора документа' };
  }

  // 3. Поиск клиента в базе.
  const matchedClient = await matchClient(parsed.client);

  const result: ParseResult = { ...parsed, files: pkg.files, matchedClient };

  // 4. Если карточка полная и есть владелец — пробуем автосабмит.
  if (ownerId && isCardComplete(parsed.input, parsed.missing)) {
    try {
      const submitted = await autoSubmit({ ownerId, parsed: result });
      if (submitted.ok) {
        return {
          ok: true,
          mode: 'redirect',
          redirect: `/projects/${submitted.projectId}/systems/${submitted.systemId}/calc`,
        };
      }
      // Автосабмит не прошёл (ошибка валидации/БД) — отдадим карточку на ревью.
      // Логируем причину в консоль сервера для диагностики.
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
}

type AutoSubmitOutcome =
  | { ok: true; projectId: string; systemId: string }
  | { ok: false; errors: string[] };

/**
 * Автосабмит: создаёт клиента (если нужно), проект, систему, прогоняет расчёт.
 * Все шаги — атомарно с точки зрения вызывающего: при ошибке возвращает errors.
 */
async function autoSubmit({ ownerId, parsed }: AutoSubmitParams): Promise<AutoSubmitOutcome> {
  // 1. Клиент.
  const clientId = await resolveClientId(parsed.client, parsed.matchedClient);

  // 2. Имена проекта/объекта/системы из meta.
  const objectName = parsed.meta.object_name?.trim() || 'Объект не указан';
  const projectName = parsed.meta.object_name
    ? `${parsed.meta.object_name.trim()} — НС пожаротушения`
    : `Расчёт из ТЗ (${new Date().toLocaleDateString('ru-RU')})`;
  const systemName = 'Пожарная насосная станция';

  // 3. Проект.
  const project = await db.project.create({
    data: {
      name: projectName,
      objectName,
      clientId,
      ownerId,
      deadline: parsed.meta.deadline ? safeDate(parsed.meta.deadline) : null,
    },
  });

  // 4. Дело: пустой каркас + распарсенная карточка.
  const base = createEmptyDossier(systemName);
  const dossier: Dossier = {
    meta: { ...base.meta, ...scrubMeta(parsed.meta) },
    stations: [
      {
        ...base.stations[0],
        input: {
          ...base.stations[0].input,
          ...scrubInput(parsed.input as Record<string, unknown>),
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
      name: systemName,
      projectId: project.id,
      typeCode: 'fire',
      engineerId: ownerId,
      dossier: dossier as unknown as Prisma.InputJsonValue,
    },
  });

  // 5. Прогоняем расчёт.
  const calc = await runSystemCalc(system.id);
  // Даже если расчёт упал внутри (например, гейт), система создана —
  // редиректим на calc-страницу, инженер увидит ошибки и доработает.
  if (!calc.ok) {
    console.warn('[parse] autoSubmit: calc returned errors:', calc.errors);
  }

  revalidatePath('/projects');
  revalidatePath(`/projects/${project.id}`);
  return { ok: true, projectId: project.id, systemId: system.id };
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
 * Чистит `meta` от null'ов в опциональных полях верхнего уровня.
 * ИИ-разбор регулярно возвращает `customer: null` / `object_name: null`
 * для отсутствующих в ТЗ реквизитов — AJV в этом случае ругается
 * «/meta/customer: must be string». Превращаем такие null'ы в отсутствие
 * ключа, чтобы валидация схемы пропускала.
 */
function scrubMeta<T extends Partial<Meta>>(meta: T): T {
  const out = { ...meta } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === null) delete out[key];
  }
  return out as T;
}

/**
 * То же для `input` — но глубже: ИИ часто возвращает `system_pressure: null`,
 * `jockey_Q: null`, `fire_params: { fire_duration: null, ... }` — AJV видит
 * «must be object», потому что Measured ожидается объектом, не null.
 * Рекурсивно убираем null-значения и null-поля внутри вложенных объектов.
 * Поле `value: null` внутри Measured ОСТАВЛЯЕМ — оно разрешено схемой.
 */
function scrubInput<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null) continue;
    if (Array.isArray(val)) {
      out[key] = val;
      continue;
    }
    if (typeof val === 'object') {
      // Measured (есть свойство value) — сохраняем как есть, value: null валиден.
      if ('value' in (val as object)) {
        out[key] = val;
      } else {
        out[key] = scrubInput(val as Record<string, unknown>);
      }
      continue;
    }
    out[key] = val;
  }
  return out as T;
}

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
