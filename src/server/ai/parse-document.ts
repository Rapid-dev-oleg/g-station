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
import { askKimi, kimiAvailable, type KimiImage } from './kimi';
import { db } from '@/server/db';
import type {
  Meta,
  Scenario,
  StationInput,
  FirePurpose,
  ReservationScheme,
} from '@/lib/dossier/types';

/**
 * Реестр типа станции — что нужно, чтобы тип ОПРЕДЕЛИТЬ и РАСПАРСИТЬ.
 * Источник — таблица SystemType (скил «ядро + модуль типа», перенесён в данные).
 * Добавить новый тип = INSERT строки SystemType, без правок парсера.
 */
export interface TypeRegistryEntry {
  code: string;
  name: string;
  /** Ключевые слова в ТЗ, по которым станция относится к этому типу. */
  triggers: string[];
  /** Допустимые назначения станции этого типа (purpose). */
  purposes: string[];
  /** Что считать КОМПОНЕНТОМ станции, а не отдельной системой. */
  components: string[];
  skillName: string | null;
}

const toStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

/** Загружает реестр готовых (READY) типов систем из БД. */
export async function loadTypeRegistry(): Promise<TypeRegistryEntry[]> {
  const rows = await db.systemType.findMany({ where: { status: 'READY' } });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    triggers: toStrArray(r.triggers),
    purposes: toStrArray(r.purposes),
    components: toStrArray(r.components),
    skillName: r.skillName ?? null,
  }));
}

/**
 * ПРИНЦИП ДЕЛЕНИЯ на системы — ядро скила (шаг1-вход.md §1.4), общий для всех
 * типов, поэтому живёт здесь, а не в строке SystemType. Per-type специфика
 * (триггеры/назначения/компоненты) приходит из реестра.
 */
const SPLIT_PRINCIPLE = `ПРИНЦИП ДЕЛЕНИЯ НА СИСТЕМЫ (ядро скила pump-station-calc, шаг1-вход.md §1.4) —
выполняй буквально:
Система — это ОДНА НЕЗАВИСИМАЯ ГРУППА НАСОСОВ со своим назначением и своей
гидравликой (Q, H). На одном объекте их может быть несколько (напр. наружное
ПТ + АУПТ, или пожарная + хоз-питьевая) — тогда верни по элементу на каждую.

Признак КОМПОНЕНТА (а не системы): он не имеет самостоятельного назначения
(сам не тушит и не снабжает отдельного потребителя), а обслуживает основную
группу насосов. Компоненты НИКОГДА не выделяй отдельным элементом "systems":
жокей-насос заноси в поля родительской станции (jockey_required=true,
jockey_Q, jockey_H); коллектор, ШУ, бак, обвязку, реле, датчики, компрессор —
это оборудование станции. Если сомневаешься — это компонент основной станции.`;

/** Данные заказчика, извлечённые из шапки/реквизитов документа. */
export interface ParsedClient {
  shortName: string;
  fullName?: string;
  inn?: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

/** Одна насосная система, выделенная из ТЗ. */
export interface ParsedSystem {
  /** Короткое имя системы (например «Пожаротушение АУПТ»). */
  systemName: string;
  /** Тип системы: 'fire' (пожарная) / 'water' (водоснабжение). */
  typeCode: string;
  /** Карточка параметров станции. */
  input: Partial<StationInput>;
  /** Обязательные поля, отсутствующие в ТЗ. */
  missing: string[];
}

/** Результат разбора документа ТЗ — одна или несколько систем. */
export interface ParsedDocument {
  /** Общие метаданные объекта (объект, заказчик, сценарий, формат). */
  meta: Partial<Meta>;
  /** Заказчик из документа (null, если реквизиты не обнаружены). */
  client: ParsedClient | null;
  /** Системы объекта (в ТЗ может быть несколько — пожарная + хоз-питьевая). */
  systems: ParsedSystem[];
  /** Сырой ответ модели — для отладки. */
  raw?: string;
}

/** Назначение → код типа по реестру (тип, в чьём списке purposes оно есть). */
function typeCodeForPurpose(purpose: string | undefined, registry: TypeRegistryEntry[]): string {
  if (purpose) {
    const hit = registry.find((t) => t.purposes.includes(purpose));
    if (hit) return hit.code;
  }
  // Дефолт — пожарный тип (приложение для G-Fire), иначе первый READY.
  return registry.find((t) => t.code === 'fire')?.code ?? registry[0]?.code ?? 'fire';
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

/** Блок идентификации типов — собирается из реестра READY-типов. */
function buildIdentificationBlock(registry: TypeRegistryEntry[]): string {
  if (registry.length === 0) return '';
  const lines = registry.map(
    (t) => `  • тип "${t.code}" (${t.name}) — если в ТЗ есть: ${t.triggers.join(', ')};`,
  );
  return `ОПРЕДЕЛЕНИЕ ТИПА СИСТЕМЫ (по триггерам реестра типов):
${lines.join('\n')}
У каждой системы проставь "station_type" = код типа из списка выше.`;
}

/** Строит пользовательский промпт: реестр типов + перечень полей + текст ТЗ. */
function buildPrompt(text: string, registry: TypeRegistryEntry[]): string {
  return `Извлеки из пакета документов ВСЕ независимые насосные системы объекта.

${SPLIT_PRINCIPLE}

${buildIdentificationBlock(registry)}

Верни массив "systems": по одному элементу на КАЖДУЮ независимую систему.
Если система одна — массив из одного элемента. Общие данные объекта и
заказчика — в "meta" (один раз, не дублировать в системах).

ФОРМАТ ОТВЕТА — JSON-объект со структурой:
{
  "meta": {
    "object_name": "наименование объекта (строка)",
    "customer": "заказчик — краткое имя (строка)",
    "scenario": один из [${SCENARIO_VALUES.join(', ')}],
    "output_format": "ТП+смета" | "ТКП-без-технички" | "только-смета" | "ТП+смета+чертёж-DWG",
    "deadline": "срок поставки, если указан (строка)"
  },
  "client": { "shortName": "...", "fullName": "...", "inn": "...", "contactName": "...", "phone": "...", "email": "..." } | null,
  "systems": [
    {
      "systemName": "короткое имя системы, например «Пожаротушение АУПТ» или «Хоз-питьевое водоснабжение»",
      "input": {
        "station_type": "fire" (пожарная) | "water" (хоз-питьевое/повышение давления),
        "purpose": один из [${PURPOSE_VALUES.join(', ')}],
        "Q": measured (расход станции, м³/ч),
        "H": measured (напор станции, м),
        "system_pressure": measured (давление в системе, МПа/бар — альтернатива напору),
        "inlet_pressure": measured (гарантированный напор/давление на вводе, м),
        "reservation_scheme": один из [${SCHEME_VALUES.join(', ')}] (например «1 рабочий + 1 резервный» → "1/1", «2+1» → "2/1"),
        "working_pumps": целое, "reserve_pumps": целое,
        "jockey_required": true|false,
        "jockey_Q": measured, "jockey_H": measured (если жокей задан с параметрами),
        "start_type": "прямой" | "плавный" | "частотный" | "каскадный",
        "collector_material": "углеродистая-сталь" | "нержавеющая-сталь",
        "station_enclosure": "моноблок-на-раме" | "технологический-павильон" | "блок-бокс" | "подземное-стеклопластик" | "стеклопластиковый-колодец" | "в-чужом-резервуаре" | "береговой-модуль",
        "installation_place": "в-помещении" | "под-заливом" | "заглублённая" | "на-берегу",
        "reservoirs": { "required": bool, "count": целое, "volume": measured (м³), "material": "сборный-металл"|"стеклопластик"|"бетонный-чужой", "volume_given": bool },
        "fire_params": { "fire_duration": measured (ч), "fire_flow_rate": measured (л/с), "streams_count": целое, "stream_flow": measured (л/с), "replenishment_time": measured (ч) },
        "power_supply": { "category": "I"|"II"|"III", "inputs": целое, "avr": bool, "voltage": "строка", "from_generator": bool },
        "climate_execution": "стандарт" | "У-1" | "УХЛ1" | "УХЛ4",
        "manufacturer_preference": ["строки"],
        "assumptions": ["текстовые формулировки всех принятых допущений"],
        "special_requirements": ["особые требования из ТЗ"]
      },
      "missing": ["имена обязательных полей этой системы, отсутствующих в ТЗ"]
    }
  ]
}

ОБЯЗАТЕЛЬНЫЕ поля каждой системы: purpose, Q, H, reservation_scheme.
Для пожарных дополнительно: fire_params.fire_duration, fire_params.fire_flow_rate,
station_enclosure, installation_place. Не найдено — добавь имя в "missing" этой системы.

Каждое числовое значение — объект {value, unit, source, note}.
Включай только реально извлечённые или обоснованно выведенные поля.
Все допущения дублируй текстом в input.assumptions.

${
  text
    ? `ПАКЕТ ДОКУМЕНТОВ:\n"""\n${text}\n"""`
    : `ПАКЕТ ДОКУМЕНТОВ приложен изображениями (сканы/фото страниц ТЗ).
Внимательно прочитай весь текст на изображениях, включая таблицы, штампы и рукописные пометки.`
}`;
}

// ── Гард: компоненты станции не должны стать «системами» ─────────────────────

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Жокей — особый компонент (есть Q/H, сворачиваем в jockey_*); опознаётся
// универсально, независимо от реестра.
const JOCKEY_RE = /жокей|jockey|подкачивающ/i;

/**
 * Жокей-насос / ШУ / коллектор / бак — это КОМПОНЕНТЫ станции (скил
 * шаг1-вход.md §1.4), а не самостоятельные системы. Если модель всё же
 * выделила такой компонент отдельным элементом `systems` — сворачиваем его
 * в родительскую станцию (для жокея — в поля jockey_*), а лишний элемент
 * убираем. Список компонентов берём из реестра типов (`componentWords`),
 * чтобы он управлялся данными, а не хардкодом.
 */
export function foldComponentSystems(
  systems: ParsedSystem[],
  componentWords: string[],
): ParsedSystem[] {
  if (systems.length <= 1) return systems;

  const isJockey = (s: ParsedSystem) => JOCKEY_RE.test(s.systemName);
  // Прочие компоненты из реестра (кроме жокея) — отбрасываем без переноса
  // гидравлики (их параметры не относятся к станции как целому).
  const otherWords = componentWords.filter((w) => !JOCKEY_RE.test(w));
  const otherRe = otherWords.length
    ? new RegExp(otherWords.map(escapeRegex).join('|'), 'i')
    : null;
  const isOtherComponent = (s: ParsedSystem) =>
    !isJockey(s) && otherRe !== null && otherRe.test(s.systemName);

  const stations = systems.filter((s) => !isJockey(s) && !isOtherComponent(s));
  // Сворачивать некуда — оставляем как есть, чтобы не потерять единственную систему.
  if (stations.length === 0) return systems;

  for (const s of systems) {
    if (!isJockey(s)) continue;
    // Родитель — пожарная станция (жокей типичен для ВПВ/АУПТ), иначе первая.
    const parent = stations.find((p) => p.typeCode === 'fire') ?? stations[0];
    parent.input.jockey_required = true;
    if (s.input.Q && !parent.input.jockey_Q) parent.input.jockey_Q = s.input.Q;
    if (s.input.H && !parent.input.jockey_H) parent.input.jockey_H = s.input.H;
  }

  return stations;
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

/** Источник для разбора: текстовый слой и/или изображения (сканы). */
export interface ParseSource {
  /** Извлечённый текст пакета (если есть текстовый слой). */
  text?: string;
  /** Изображения страниц/сканов (для документов без текста). */
  images?: KimiImage[];
}

/**
 * Разбирает документ ТЗ в карточку параметров станции.
 *
 * Маршрутизация:
 *  - есть текст → текстовый запрос;
 *  - текста нет, есть картинки → vision-запрос к Kimi (kimi-for-coding);
 *  - Kimi недоступен (нет MOONSHOT_API_KEY) → текстовый fallback на OpenRouter,
 *    сканы без Kimi разобрать нельзя.
 */
export async function parseDocument(source: ParseSource | string): Promise<ParsedDocument> {
  // Обратная совместимость: раньше принимали просто строку текста.
  const src: ParseSource = typeof source === 'string' ? { text: source } : source;
  const hasText = Boolean(src.text && src.text.trim().length >= 10);
  const hasImages = Boolean(src.images && src.images.length > 0);

  if (!hasText && !hasImages) {
    throw new Error('Нет ни текста, ни изображений для разбора документа');
  }

  // Реестр типов из БД — управляет идентификацией и парсингом (см. SystemType).
  const registry = await loadTypeRegistry();
  const prompt = buildPrompt(hasText ? src.text! : '', registry);

  let content: string;
  if (kimiAvailable()) {
    ({ content } = await askKimi({
      system: SYSTEM_PROMPT,
      prompt,
      images: hasImages ? src.images : undefined,
      maxTokens: 4000,
    }));
  } else {
    if (!hasText) {
      throw new Error(
        'Документ без текстового слоя (скан) требует Kimi — задайте MOONSHOT_API_KEY',
      );
    }
    ({ content } = await askAi({ system: SYSTEM_PROMPT, prompt, jsonMode: true }));
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(content) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      'Не удалось разобрать ответ ИИ как JSON: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  const meta = (parsed.meta ?? {}) as Partial<Meta>;
  const rawClient = parsed.client as ParsedClient | null | undefined;

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

  // Системы. Совместимость: если модель вернула старый формат (input на
  // верхнем уровне) — оборачиваем в массив из одной системы.
  const rawSystems = Array.isArray(parsed.systems)
    ? (parsed.systems as Record<string, unknown>[])
    : parsed.input
      ? [{ input: parsed.input, missing: parsed.missing }]
      : [];

  const knownCodes = new Set(registry.map((t) => t.code));
  const systems: ParsedSystem[] = rawSystems.map((s, i) => {
    const input = (s.input ?? {}) as Partial<StationInput>;
    const purpose = input.purpose as string | undefined;
    // Код типа от модели принимаем только если он есть в реестре READY-типов;
    // иначе определяем по назначению через реестр.
    const claimed = input.station_type as string | undefined;
    const typeCode =
      claimed && knownCodes.has(claimed) ? claimed : typeCodeForPurpose(purpose, registry);
    input.station_type = typeCode as StationInput['station_type'];
    const missing = Array.isArray(s.missing)
      ? (s.missing as unknown[]).map((m) => String(m))
      : [];
    const name =
      (typeof s.systemName === 'string' && s.systemName.trim()) ||
      `Система ${i + 1}${purpose ? ` (${purpose})` : ''}`;
    return { systemName: name, typeCode, input, missing };
  });

  if (systems.length === 0) {
    throw new Error('Модель не выделила ни одной системы из ТЗ');
  }

  // Свернуть компоненты (жокей/ШУ/…), ошибочно ставшие отдельными системами.
  // Список компонентов — объединение из реестра типов.
  const componentWords = [...new Set(registry.flatMap((t) => t.components))];
  const folded = foldComponentSystems(systems, componentWords);

  return { meta, client, systems: folded, raw: content };
}
