'use server';

/**
 * Расчёт системы через Kimi-агента по скилу `pump-station-calc`.
 *
 * Агент гоняется долго (~3 мин), поэтому результат кешируется в
 * System.kimiCalc + хеш карточки (kimiCalcHash). Повторный вызов с той же
 * карточкой отдаёт кеш мгновенно; пересчёт — только когда карточка изменилась.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Dossier, StationInput, Meta } from '@/lib/dossier/types';
import { db } from '@/server/db';
import { runKimiAgent } from '@/server/ai/kimi-agent';
import { askKimi } from '@/server/ai/kimi';

/** Скил расчёта по типу системы (сейчас один — пожарные/водоснабжение). */
function skillForType(_typeCode: string): string {
  return 'pump-station-calc';
}

/** Карточка для расчёта: вход станции + назначение из dossier. */
interface CalcCard {
  object_name?: string;
  input: Partial<StationInput>;
}

function buildCard(dossier: Dossier): CalcCard {
  const meta = dossier.meta as Meta | undefined;
  return {
    object_name: meta?.object_name,
    input: dossier.stations?.[0]?.input ?? {},
  };
}

function hashCard(card: CalcCard): string {
  return createHash('sha256').update(JSON.stringify(card)).digest('hex').slice(0, 16);
}

/** Одна строка структурированного расчёта: пункт — значение — обоснование. */
export interface CalcItem {
  /** Параметр (например «Схема резервирования», «Мотор»). */
  param: string;
  /** Значение (например «1/1», «15 кВт»). */
  value: string;
  /** Краткое обоснование (1 строка). */
  rationale: string;
  /** true — решение требует проверки инженера (точная модель, бренд, наценка). */
  gate: boolean;
}

/** Структурированный результат расчёта Kimi. */
export interface KimiCalcData {
  /** Строки расчёта: пункт — значение — обоснование. */
  items: CalcItem[];
  /** Шифр изделия. */
  code?: string;
  /** Полный текст ответа (подробности, на случай нехватки структуры). */
  output: string;
  at?: string;
}

export interface KimiCalcResult {
  ok: boolean;
  /** Структурированный расчёт (если распарсился). */
  data?: KimiCalcData;
  /** Отдан ли кеш (true) или пересчитано заново (false). */
  cached?: boolean;
  error?: string;
}

/** Достаёт JSON-блок из ответа агента (```json ... ``` или первый {...}). */
function extractCalcJson(raw: string): { items: CalcItem[]; code?: string } | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1]] : [];
  // Объект целиком: от первого { до последнего } (а не от последнего {).
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim()) as { items?: unknown; code?: unknown };
      if (Array.isArray(obj.items)) {
        const items: CalcItem[] = (obj.items as Record<string, unknown>[]).map((it) => ({
          param: String(it.param ?? ''),
          value: String(it.value ?? ''),
          rationale: String(it.rationale ?? ''),
          gate: Boolean(it.gate),
        }));
        return { items, code: obj.code ? String(obj.code) : undefined };
      }
    } catch {
      /* следующий кандидат */
    }
  }
  return null;
}

/**
 * Структурирует текстовый расчёт агента в таблицу items вторым дешёвым
 * chat-запросом (агент склонен возвращать markdown вместо JSON — здесь
 * простая модель превращает его текст в структуру).
 */
async function structureViaChat(output: string): Promise<{ items: CalcItem[]; code?: string } | null> {
  try {
    const { content } = await askKimi({
      system:
        'Ты — парсер. На вход текст расчёта насосной станции. Верни СТРОГО JSON ' +
        'без markdown: {"items":[{"param":"...","value":"...","rationale":"одна строка","gate":false}],"code":"шифр"}. ' +
        'param — параметр (Схема, Класс насоса, Мотор, Коллектор DN, Жокей, Шкаф управления и т.п.). ' +
        'value — итоговое значение. rationale — краткое обоснование одной строкой. ' +
        'gate=true для решений на проверку инженеру (точная модель насоса, бренд/производитель, наценка). ' +
        'code — шифр изделия если есть.',
      prompt: 'Текст расчёта:\n\n' + output,
      maxTokens: 2000,
    });
    return extractCalcJson(content);
  } catch {
    return null;
  }
}

/**
 * Считает систему через Kimi-агента (с кешем по хешу карточки).
 * @param force пересчитать даже если кеш валиден.
 */
export async function calcSystemViaKimi(
  systemId: string,
  force = false,
): Promise<KimiCalcResult> {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) return { ok: false, error: 'Система не найдена' };

  const dossier = system.dossier as unknown as Dossier;
  const card = buildCard(dossier);
  const hash = hashCard(card);

  // Кеш валиден — отдаём без прогона агента.
  if (!force && system.kimiCalcHash === hash && system.kimiCalc) {
    const cached = system.kimiCalc as Partial<KimiCalcData>;
    return {
      ok: true,
      data: {
        items: cached.items ?? [],
        code: cached.code,
        output: cached.output ?? '',
        at: cached.at,
      },
      cached: true,
    };
  }

  try {
    const { output } = await runKimiAgent({
      skill: skillForType(system.typeCode),
      prompt:
        'Посчитай насосную станцию по карточке (методика скила). Затем верни ' +
        'результат СТРОГО в виде JSON-блока ```json ... ``` со структурой:\n' +
        '{\n' +
        '  "items": [\n' +
        '    {"param": "Схема резервирования", "value": "1/1", "rationale": "<1 строка почему>", "gate": false},\n' +
        '    {"param": "Класс насоса", "value": "...", "rationale": "...", "gate": false},\n' +
        '    {"param": "Мотор", "value": "15 кВт", "rationale": "...", "gate": false},\n' +
        '    {"param": "Коллектор DN", "value": "...", "rationale": "...", "gate": false},\n' +
        '    {"param": "Жокей-насос", "value": "...", "rationale": "...", "gate": false},\n' +
        '    {"param": "Шкаф управления", "value": "...", "rationale": "...", "gate": false},\n' +
        '    {"param": "Точная модель насоса", "value": "—", "rationale": "нужны кривые ПО", "gate": true},\n' +
        '    {"param": "Производитель/бренд", "value": "...", "rationale": "...", "gate": true},\n' +
        '    {"param": "Коэффициент наценки", "value": "...", "rationale": "...", "gate": true}\n' +
        '  ],\n' +
        '  "code": "<шифр изделия>"\n' +
        '}\n' +
        'gate=true — решение требует проверки инженера (точная модель, бренд, наценка). ' +
        'Каждый rationale — одна короткая строка. Карточка:\n' +
        JSON.stringify(card, null, 2),
      timeoutMs: 8 * 60 * 1000,
    });

    // Агент мог вернуть JSON сам; если нет — структурируем его текст chat-запросом.
    const parsed = extractCalcJson(output) ?? (await structureViaChat(output));
    const data: KimiCalcData = {
      items: parsed?.items ?? [],
      code: parsed?.code,
      output,
      at: new Date().toISOString(),
    };

    await db.system.update({
      where: { id: systemId },
      data: {
        kimiCalc: data as unknown as object,
        kimiCalcHash: hash,
        status: 'CALCULATED',
      },
    });

    revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
    return { ok: true, data, cached: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Сохраняет ручные правки строк расчёта (инженер скорректировал значения). */
export async function saveCalcEdits(
  systemId: string,
  items: CalcItem[],
): Promise<{ ok: boolean; error?: string }> {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system || !system.kimiCalc) return { ok: false, error: 'Расчёта нет' };
  const cur = system.kimiCalc as Partial<KimiCalcData>;
  await db.system.update({
    where: { id: systemId },
    data: { kimiCalc: { ...cur, items } as unknown as object },
  });
  revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
  return { ok: true };
}
