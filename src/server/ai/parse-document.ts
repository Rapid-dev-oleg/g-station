/**
 * Разбор документа ТЗ — шаг 1 расчётного конвейера (скил pump-station-calc).
 *
 * Из простого текста ТЗ извлекает карточку параметров станции (`StationInput`
 * + `Meta`) и данные заказчика. Каждое числовое значение помечается
 * провенансом (`extracted` / `derived` / `assumed`); чего нет в ТЗ —
 * перечисляется в `missing`. Результат — черновик для гейта инженера,
 * данные не выдумываются молча.
 */

import { askAi } from './index';
import type {
  Meta,
  Scenario,
  StationInput,
  FirePurpose,
  ReservationScheme,
} from '@/lib/dossier/types';

/** Данные заказчика, извлечённые из шапки/реквизитов документа. */
export interface ParsedClient {
  shortName: string;
  fullName?: string;
  inn?: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

/** Результат разбора документа ТЗ. */
export interface ParsedDocument {
  /** Частично заполненная карточка параметров станции. */
  input: Partial<StationInput>;
  /** Частично заполненные метаданные кейса. */
  meta: Partial<Meta>;
  /** Заказчик из документа (null, если реквизиты не обнаружены). */
  client: ParsedClient | null;
  /** Поля карточки, отсутствующие в ТЗ — требуют ввода инженером. */
  missing: string[];
  /** Сырой ответ модели — для отладки. */
  raw?: string;
}

// ── Перечни допустимых значений (передаются модели в промпте) ──────────────

const PURPOSE_VALUES: FirePurpose[] = [
  'наружное-ПТ',
  'ВПВ',
  'АУПТ',
  'пожаротушение-общее',
  'хоз-питьевое',
  'повышение-давления',
  'береговая-ПНС',
];

const SCHEME_VALUES: ReservationScheme[] = ['1/0', '1/1', '2/1', '2/2', '3/1'];

const SCENARIO_VALUES: Scenario[] = [
  'подбор-с-нуля',
  'проверка-чужого-подбора',
  'подбор-на-аналог',
  'замена-конкурента',
  'торги-аукцион',
  'переторжка',
  'два-исполнения',
  'пересчёт-под-новый-СП',
];

// ── Промпт ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — инженер-расчётчик насосных станций пожаротушения компании «Гидрострой-НН».
Тебе дают текст технического задания (ТЗ), опросного листа или заметки менеджера.
Твоя задача — выполнить ШАГ 1 методики: извлечь структурированную карточку параметров
пожарной насосной станции строго в формате JSON.

ПРАВИЛА ИЗВЛЕЧЕНИЯ:
1. Числовые величины (Q, H, давления, объёмы, мощности и т.п.) возвращай объектом
   {"value": число|null, "unit": "ед.изм", "source": "...", "note": "пояснение"}.
2. Поле source — провенанс значения:
   - "extracted"  — значение прямо написано в документе;
   - "derived"    — выведено пересчётом (например л/с → м³/ч умножением на 3,6,
                    или напор станции = требуемый напор − напор на вводе);
   - "assumed"    — допущение по нормам/умолчаниям, когда в ТЗ данных нет.
3. Расход в л/с переводи в м³/ч умножением на 3,6 (source="derived",
   в note укажи исходное значение в л/с).
4. Ничего не выдумывай молча. Если параметра в ТЗ нет и его нельзя обоснованно
   вывести — НЕ включай его в input, а добавь имя поля в массив "missing".
5. Любое допущение (source="assumed") продублируй текстом в input.assumptions
   с кратким обоснованием.
6. Тип станции для пожаротушения всегда station_type="fire".
7. Заказчика извлекай из реквизитов/шапки документа в объект "client";
   если реквизитов нет — client=null.

ВОЗВРАЩАЙ СТРОГО ОДИН JSON-ОБЪЕКТ, без markdown, без пояснений вокруг.`;

/** Строит пользовательский промпт: перечень полей карточки + текст ТЗ. */
function buildPrompt(text: string): string {
  return `Извлеки карточку параметров пожарной насосной станции из текста ТЗ ниже.

ФОРМАТ ОТВЕТА — JSON-объект со структурой:
{
  "meta": {
    "object_name": "наименование объекта (строка)",
    "customer": "заказчик — краткое имя (строка)",
    "scenario": один из [${SCENARIO_VALUES.join(', ')}],
    "output_format": "ТП+смета" | "ТКП-без-технички" | "только-смета" | "ТП+смета+чертёж-DWG",
    "deadline": "срок поставки, если указан (строка)"
  },
  "input": {
    "station_type": "fire",
    "purpose": один из [${PURPOSE_VALUES.join(', ')}],
    "Q": measured (расход станции, м³/ч),
    "H": measured (напор станции, м),
    "system_pressure": measured (давление в системе, МПа — альтернатива напору),
    "inlet_pressure": measured (гарантированный напор/давление на вводе),
    "reservation_scheme": один из [${SCHEME_VALUES.join(', ')}] (например «1 рабочий + 1 резервный» → "1/1", «1+1+жокей» → "1/1"),
    "working_pumps": целое,
    "reserve_pumps": целое,
    "jockey_required": true|false,
    "jockey_Q": measured, "jockey_H": measured (если жокей задан с параметрами),
    "start_type": "прямой" | "плавный" | "частотный" | "каскадный",
    "collector_material": "углеродистая-сталь" | "нержавеющая-сталь",
    "station_enclosure": "моноблок-на-раме" | "технологический-павильон" | "блок-бокс" | "подземное-стеклопластик" | "стеклопластиковый-колодец" | "в-чужом-резервуаре" | "береговой-модуль",
    "installation_place": "в-помещении" | "под-заливом" | "заглублённая" | "на-берегу",
    "reservoirs": { "required": bool, "count": целое, "volume": measured (объём одного, м³), "material": "сборный-металл"|"стеклопластик"|"бетонный-чужой", "volume_given": bool },
    "fire_params": { "fire_duration": measured (ч), "fire_flow_rate": measured (л/с), "streams_count": целое, "stream_flow": measured (л/с), "replenishment_time": measured (ч) },
    "power_supply": { "category": "I"|"II"|"III", "inputs": целое, "avr": bool, "voltage": "строка", "from_generator": bool },
    "climate_execution": "стандарт" | "У-1" | "УХЛ1" | "УХЛ4",
    "manufacturer_preference": ["строки"],
    "assumptions": ["текстовые формулировки всех принятых допущений"],
    "special_requirements": ["особые требования из ТЗ"]
  },
  "client": { "shortName": "...", "fullName": "...", "inn": "...", "contactName": "...", "phone": "...", "email": "..." } | null,
  "missing": ["имена обязательных/важных полей, которых нет в ТЗ"]
}

Включай в "input" и "meta" ТОЛЬКО те поля, значения которых реально есть в ТЗ
или обоснованно выводимы. Остальное не включай. Обязательные поля карточки —
Q, H, purpose, reservation_scheme: если их нет в ТЗ, всё равно перечисли их в "missing".

ТЕКСТ ТЗ:
"""
${text}
"""`;
}

// ── Разбор ответа модели ────────────────────────────────────────────────────

/** Достаёт JSON-объект из ответа модели (срезает возможный markdown-обёртку). */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Снимаем ```json … ``` если модель обернула.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Модель вернула ответ без JSON-объекта');
  }
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Разбирает текст документа ТЗ в карточку параметров станции.
 * Делает запрос к ИИ (модель и ключ — из настроек) в JSON-режиме.
 */
export async function parseDocument(text: string): Promise<ParsedDocument> {
  if (!text || text.trim().length < 10) {
    throw new Error('Текст документа слишком короткий для разбора');
  }

  const { content } = await askAi({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(text),
    jsonMode: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(content) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      'Не удалось разобрать ответ ИИ как JSON: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  const input = (parsed.input ?? {}) as Partial<StationInput>;
  const meta = (parsed.meta ?? {}) as Partial<Meta>;
  const rawClient = parsed.client as ParsedClient | null | undefined;
  const missing = Array.isArray(parsed.missing)
    ? (parsed.missing as unknown[]).map((m) => String(m))
    : [];

  // Тип станции пожарный по умолчанию — карточка строится для G-Fire.
  if (!input.station_type) input.station_type = 'fire';

  // Клиент валиден только при наличии непустого краткого имени.
  const client: ParsedClient | null =
    rawClient && typeof rawClient.shortName === 'string' && rawClient.shortName.trim()
      ? {
          shortName: rawClient.shortName.trim(),
          fullName: rawClient.fullName?.trim() || undefined,
          inn: rawClient.inn?.trim() || undefined,
          contactName: rawClient.contactName?.trim() || undefined,
          phone: rawClient.phone?.trim() || undefined,
          email: rawClient.email?.trim() || undefined,
        }
      : null;

  return { input, meta, client, missing, raw: content };
}
