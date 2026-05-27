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
Тебе дают текст пакета документов клиента — один или несколько файлов: формальное ТЗ (docx),
опросный лист, проект РД (ВК, гидрорасчёт), ВОР/смета (xlsx), заметка менеджера (txt),
ТКП конкурента, чертежи (pdf). Файлы в тексте разделены заголовками
«=== Файл: <имя> (<формат>) ===». XLSX-листы — заголовками «=== Лист: <name> ===».

Твоя задача — выполнить ШАГ 1 методики «pump-station-calc»: извлечь структурированную
карточку параметров пожарной насосной станции (StationInput + Meta) и реквизиты заказчика.
Результат — строго один JSON-объект.

ПРАВИЛА ИЗВЛЕЧЕНИЯ (выполняй буквально):

1. ПРОВЕНАНС каждого числового значения — обязательное поле "source":
   - "extracted"  — взято из документа напрямую (значение есть в тексте);
   - "derived"    — выведено пересчётом из других данных (см. п.3);
   - "assumed"    — допущение по нормам/типовым значениям при отсутствии данных.
   Каждое числовое значение возвращай объектом
   {"value": число|null, "unit": "ед.изм.", "source": "extracted|derived|assumed", "note": "пояснение"}.

2. ЕДИНИЦЫ ИЗМЕРЕНИЯ и пересчёты:
   - Расход: основная единица — м³/ч. Если в ТЗ задан расход в л/с —
     пересчитай: Q[м³/ч] = Q[л/с] × 3,6; source="derived"; в note — исходное «X л/с».
   - Напор: основная единица — м (метры водяного столба). м.в.ст. = м.
   - Давление: бар ≈ кгс/см² (1:1, source="derived" при пересчёте);
     1 МПа = 10 бар; 1 МПа ≈ 100 м.в.ст. Если задано system_pressure в бар/МПа —
     можно вывести H = system_pressure × 10[МПа→м] или ×10,2[бар→м] (derived).
   - Напор станции из проекта: H_станции = H_требуемый − H_гарантированный_на_вводе
     (source="derived", в note — слагаемые).

3. ОБЯЗАТЕЛЬНЫЕ ПОЛЯ карточки (по скилу шаг1-вход.md, раздел 1.4):
   purpose, Q, H, reservation_scheme, station_enclosure, installation_place,
   fire_params.fire_duration, fire_params.fire_flow_rate (для пожарных) либо
   эквиваленты для ВПВ (streams_count + stream_flow). Если поле обязательное
   и его нет в ТЗ — обязательно добавь имя поля в массив "missing"
   (даже если ты что-то предположил с source="assumed").

4. ПРОВЕРЯЙ ВЕСЬ ТЕКСТ. Не ограничивайся первым файлом — данные часто
   распределены: ТЗ даёт назначение и схему, ВОР (xlsx) — мощности и количества,
   проект РД (pdf) — Q/H и параметры здания, заметка менеджера (txt) — сроки и бюджет.

5. НЕ ВЫДУМЫВАЙ. Если параметра нет и его нельзя обоснованно вывести — НЕ включай
   значение в input (не пиши value=null с source=assumed без обоснования),
   а просто добавь имя поля в "missing".

6. ДОПУЩЕНИЯ (source="assumed") разрешены только по нормативным умолчаниям с
   обоснованием. Каждое такое допущение продублируй текстом в input.assumptions
   с пометкой «принято <значение>, потому что <причина>». Примеры допустимых допущений:
   - inlet_pressure = 10 м (типовой гарантированный напор на вводе при отсутствии данных);
   - fire_duration = 3 ч для общественных зданий (СП 8.13130);
   - replenishment_time = 24 ч (СП 8.13130).

7. ТИП СТАНЦИИ. station_type="fire" по умолчанию (приложение — для пожарных
   станций G-Fire). Назначение purpose извлекай из ТЗ: наружное ПТ / ВПВ / АУПТ.

8. ЗАКАЗЧИК. Реквизиты (название юрлица, ИНН, контакты) — из шапки/реквизитов
   документа в "client". Если реквизитов нет — client=null. shortName — короткое
   узнаваемое имя (например «ООО Ромашка» или «Завод Х»).

9. ФОРМАТ ОТВЕТА. Возвращай СТРОГО ОДИН JSON-объект, без markdown-обёртки,
   без пояснений вокруг. Включай в "input" и "meta" только реально извлечённые
   или обоснованно выведенные поля.`;

/** Строит пользовательский промпт: перечень полей карточки + текст ТЗ. */
function buildPrompt(text: string): string {
  return `Извлеки карточку параметров пожарной насосной станции из пакета документов ниже.

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
    "system_pressure": measured (давление в системе, МПа/бар — альтернатива напору),
    "inlet_pressure": measured (гарантированный напор/давление на вводе, м),
    "reservation_scheme": один из [${SCHEME_VALUES.join(', ')}] (например «1 рабочий + 1 резервный» → "1/1", «2+1» → "2/1"),
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
    "assumptions": ["текстовые формулировки всех принятых допущений (обязательно дублируй сюда все assumed-значения)"],
    "special_requirements": ["особые требования из ТЗ"]
  },
  "client": { "shortName": "...", "fullName": "...", "inn": "...", "contactName": "...", "phone": "...", "email": "..." } | null,
  "missing": ["имена обязательных полей, отсутствующих в ТЗ (даже если ты их предположил)"]
}

ОБЯЗАТЕЛЬНЫЕ поля карточки (по методике — фиксированный список):
  purpose, Q, H, reservation_scheme.
Дополнительные обязательные для пожарных:
  fire_params.fire_duration, fire_params.fire_flow_rate,
  station_enclosure, installation_place.
Если обязательное поле не нашлось — добавь его имя в "missing".

Включай в "input" и "meta" только реально извлечённые или обоснованно выведенные поля.
Остальное не включай. Все допущения дублируй текстом в input.assumptions.

ПАКЕТ ДОКУМЕНТОВ:
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
