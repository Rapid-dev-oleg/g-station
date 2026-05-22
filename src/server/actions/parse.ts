'use server';

/**
 * Server actions для шага 1 — парсинг документа ТЗ.
 *
 * Поток: загруженный файл → извлечение текста → разбор ИИ → карточка
 * параметров. На этом шаге записи в БД НЕ создаются: инженер сперва
 * смотрит результат на экране ревью (гейт 1).
 */

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createEmptyDossier } from '@/lib/dossier/factory';
import type { Dossier, Meta, StationInput } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { extractText } from '@/server/ai/extract-text';
import { parseDocument, type ParsedClient, type ParsedDocument } from '@/server/ai/parse-document';
import { db } from '@/server/db';

/** Результат парсинга — для экрана ревью. */
export interface ParseResult extends ParsedDocument {
  /** Имя исходного файла. */
  filename: string;
  /** Распознанный формат документа. */
  format: 'txt' | 'pdf' | 'docx';
  /** Найденный в базе клиент (совпадение по названию/ИНН) или null. */
  matchedClient: {
    id: string;
    shortName: string;
    fullName: string | null;
    inn: string | null;
  } | null;
}

export type ParseResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string };

/**
 * Принимает загруженный файл из FormData, извлекает текст, разбирает ИИ.
 * Возвращает карточку параметров для ревью. В БД ничего не пишет.
 */
export async function parseUploadedDocument(
  formData: FormData,
): Promise<ParseResponse> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Файл не выбран или пуст' };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: 'Файл слишком большой (максимум 15 МБ)' };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, format } = await extractText(file.name, buffer);
    const parsed = await parseDocument(text);
    const matchedClient = await matchClient(parsed.client);

    return {
      ok: true,
      result: { ...parsed, filename: file.name, format, matchedClient },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Ошибка обработки документа',
    };
  }
}

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

// ── Подтверждение разбора: создание сущностей и записи карточки ──────────────

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
        deadline: data.project.deadline ? new Date(data.project.deadline) : null,
      },
    });
    projectId = project.id;
  }

  // Собираем расчётное дело: пустой каркас + карточка из разбора.
  const base = createEmptyDossier(data.systemName);
  const dossier: Dossier = {
    meta: { ...base.meta, ...data.meta },
    stations: [
      {
        ...base.stations[0],
        input: { ...base.stations[0].input, ...data.input },
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
