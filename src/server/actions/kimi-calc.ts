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
import { priceEquipment } from '@/server/pricing/processor';
import { getPricingSettings } from '@/server/pricing/settings';

/** Скил расчёта по типу системы — из реестра SystemType (fallback на дефолт). */
async function skillForType(typeCode: string): Promise<string> {
  const t = await db.systemType.findUnique({
    where: { code: typeCode },
    select: { skillName: true },
  });
  return t?.skillName ?? 'pump-station-calc';
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

/** Строка сметы (BOM): позиция с ценой. */
export interface BomLine {
  /** Наименование (например «Насос CNP TD65-41G», «Материалы коллектора»). */
  name: string;
  /** Артикул/модель (если подобран конкретный). */
  article?: string;
  /** Поставщик/источник цены (сайт, склад). */
  supplier?: string;
  /** Цена за единицу, ₽. */
  priceRub?: number;
  /** Количество. */
  qty?: number;
  /** Сумма по строке, ₽. */
  sum?: number;
  /** Примечание (наличие, срок). */
  note?: string;
  /** Источник цены: 'db' (юзерский прайс из catalog), 'web' (нашли в интернете),
   *  'estimate' (оценка по правилу/методичке, прайса нет). */
  source?: 'db' | 'web' | 'estimate';
  /** URL страницы оборудования (для web — ссылка на сайт производителя/магазина). */
  sourceUrl?: string;
  /** Уровень варианта (для насоса): optimum/reserve/economy. */
  tier?: 'optimum' | 'reserve' | 'economy';
  /** Альтернативные варианты — в UI инженер может переключиться. */
  alternatives?: BomLine[];
}

/** Структурированный результат расчёта Kimi. */
export interface KimiCalcData {
  /** Строки расчёта характеристик: пункт — значение — обоснование. */
  items: CalcItem[];
  /** Смета (позиции с ценами, подбор через веб-поиск). */
  bom?: BomLine[];
  /** Себестоимость (сумма закупки), ₽. */
  total?: number;
  /** Коэффициент наценки. */
  markup?: number;
  /** Цена клиенту, ₽ (total × markup). */
  clientPrice?: number;
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

type ParsedCalc = Pick<KimiCalcData, 'items' | 'bom' | 'total' | 'markup' | 'clientPrice' | 'code'> & {
  equipment?: EquipmentReq[];
};

/** Требование к позиции оборудования — приходит из расчёта Kimi (open list). */
export interface EquipmentReq {
  /** Категория: pump | jockey | collector | shu | tank | valve | check_valve |
   *  pressure_switch | gauge | vibro_mount | pipe_fitting | sensor | compressor |
   *  cabinet | vfd | свободная строка. */
  category: string;
  /** Человекочитаемое название позиции. */
  name: string;
  /** Количество в комплекте. */
  qty?: number;
  /** Характеристики (свободный объект — зависит от категории). */
  req?: Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Достаёт JSON-блок из ответа агента (```json ... ``` или объект целиком). */
function extractCalcJson(raw: string): ParsedCalc | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1]] : [];
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim()) as Record<string, unknown>;
      if (Array.isArray(obj.items) || Array.isArray(obj.bom) || Array.isArray(obj.equipment)) {
        const items: CalcItem[] = (Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : []).map((it) => ({
          param: String(it.param ?? ''),
          value: String(it.value ?? ''),
          rationale: String(it.rationale ?? ''),
          gate: Boolean(it.gate),
        }));
        const bom: BomLine[] | undefined = Array.isArray(obj.bom)
          ? (obj.bom as Record<string, unknown>[]).map((b) => ({
              name: String(b.name ?? ''),
              article: b.article ? String(b.article) : undefined,
              supplier: b.supplier ? String(b.supplier) : undefined,
              priceRub: num(b.priceRub),
              qty: num(b.qty),
              sum: num(b.sum),
              note: b.note ? String(b.note) : undefined,
            }))
          : undefined;
        const equipment: EquipmentReq[] | undefined = Array.isArray(obj.equipment)
          ? (obj.equipment as Record<string, unknown>[]).map((e) => ({
              category: String(e.category ?? ''),
              name: String(e.name ?? ''),
              qty: num(e.qty),
              req: (e.req && typeof e.req === 'object' ? (e.req as Record<string, unknown>) : undefined),
            }))
          : undefined;
        return {
          items,
          bom,
          equipment,
          total: num(obj.total),
          markup: num(obj.markup),
          clientPrice: num(obj.clientPrice),
          code: obj.code ? String(obj.code) : undefined,
        };
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
async function structureViaChat(output: string): Promise<ParsedCalc | null> {
  try {
    const { content } = await askKimi({
      system:
        'Ты — парсер. На вход текст расчёта и подбора насосной станции. Верни СТРОГО JSON без markdown:\n' +
        '{"items":[{"param":"...","value":"...","rationale":"одна строка","gate":false}],' +
        '"bom":[{"name":"...","article":"...","supplier":"...","priceRub":число,"qty":число,"sum":число,"note":"..."}],' +
        '"total":число,"markup":число,"clientPrice":число,"code":"шифр"}\n' +
        'items — характеристики (Схема, Класс насоса, Мотор, Коллектор DN, Материал коллектора, ' +
        'Жокей, Шкаф управления, Объём запаса, Шифр). НЕ включай строки «Точная модель насоса», ' +
        '«Производитель/бренд», «Коэффициент наценки» — они приходят из веб-подбора и кода. ' +
        'gate=true для остальных решений, требующих экспертного подтверждения. ' +
        'bom — смета: позиции (насос с артикулом и поставщиком, материалы коллектора, работы, ШУ) с ценами ₽. ' +
        'total — себестоимость (сумма закупки), markup — коэффициент наценки, clientPrice — цена клиенту. ' +
        'Если цены/артикулы в тексте нет — оставь поле пустым, не выдумывай. code — шифр.',
      prompt: 'Текст расчёта и подбора:\n\n' + output,
      maxTokens: 3000,
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
  signal?: AbortSignal,
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
        items: (cached.items ?? []).filter(
          (it) => !/точная модель|производител|бренд|коэффициент наценк/i.test(it.param),
        ),
        bom: cached.bom,
        total: cached.total,
        markup: cached.markup,
        clientPrice: cached.clientPrice,
        code: cached.code,
        output: cached.output ?? '',
        at: cached.at,
      },
      cached: true,
    };
  }

  try {
    // ── Фаза 1: расчёт характеристик по скилу (без веба — мало шагов). ──
    const { output: calcOut } = await runKimiAgent({
      skill: await skillForType(system.typeCode),
      prompt:
        'Выполни ШАГИ 1-3 скила pump-station-calc для этой станции: определи тип, ' +
        'посчитай рабочую точку и характеристики (шаг 2), подбери ПОЛНЫЙ СОСТАВ ' +
        'оборудования (шаг 3 — основной насос, жокей если нужен, коллектор, ШУ, ' +
        'резервуары, дренажный/вакуумный насос, реле/манометры/затворы/клапаны, ' +
        'компрессор, патрубки МПТ, опции 04/05/08 — всё, что диктует методика и ' +
        'модуль типа). НЕ ограничивайся минимальным списком — пройди скил.\n\n' +
        'НЕ ищи в интернете (точные модели/цены найдёт следующий этап). НЕ выбирай ' +
        'бренд/производителя/точную модель — это решение инженера (правило 3.11).\n\n' +
        'Верни СТРОГО JSON-блоком:\n' +
        '```json\n' +
        '{\n' +
        '  "items":[{"param":"<характеристика>","value":"<значение>","rationale":"<правило/норматив>","gate":false}, ...],\n' +
        '  "code":"<шифр изделия по nomenclature.md>",\n' +
        '  "equipment":[\n' +
        '    {"category":"<категория>","name":"<наименование>","qty":<n>,"req":{<характеристики позиции>}},\n' +
        '    ...\n' +
        '  ]\n' +
        '}\n' +
        '```\n\n' +
        'Категории equipment — выбирай уместные: pump, jockey, collector, shu, ' +
        'tank, vfd, valve, check_valve, pressure_switch, gauge, vibro_mount, ' +
        'pipe_fitting, sensor, compressor, drainage_pump, vacuum_pump, ' +
        'foot_valve, suction_hose, mpt_branch, cabinet (под кабину/корпус). ' +
        'Для pump req — class/Q/H/motor_kW; для collector — dn_suction/' +
        'dn_discharge/n_pumps/dn_nozzle/material; для shu — motor_kW/start_type/' +
        'series/options; для tank — volume_m3/material; для valve — dn/qty.\n\n' +
        'НЕ включай в items строки «Точная модель насоса», «Производитель/бренд», ' +
        '«Коэффициент наценки» — это решение инженера / следующий этап.\n\n' +
        'Карточка:\n' +
        JSON.stringify(card, null, 2),
      timeoutMs: 8 * 60 * 1000,
      signal,
    });

    // Структурируем характеристики (фаза 1).
    const calcParsed = extractCalcJson(calcOut) ?? (await structureViaChat(calcOut));
    const items = (calcParsed?.items ?? []).filter(
      (it) => !/точная модель|производител|бренд|коэффициент наценк/i.test(it.param),
    );

    // ── Этап C: подбор моделей и цен — ОДИН агентный проход по всему составу. ──
    // Агент (MCP к БД → веб → оценка) возвращает строку на КАЖДУЮ позицию
    // equipment[], включая основной насос. Инвариант «позиция → строка BOM»
    // (estimate, если цены нет) гарантируется внутри priceEquipment — насос
    // больше не теряется. Кода-методики/перехвата насоса/хардкода нет.
    const equipment: EquipmentReq[] = calcParsed?.equipment ?? [];
    const settings = await getPricingSettings();
    if (equipment.length === 0) {
      console.warn('[kimi-calc] фаза 1 не вернула equipment[] — смета пустая, без хардкод-набора');
    }
    const bom: BomLine[] = await priceEquipment(equipment, signal);

    const total = bom.reduce((s, b) => s + (b.sum ?? 0), 0);
    const markup = settings.clientMarkup;
    const clientPrice = Math.round(total * markup);

    const output = calcOut;
    const data: KimiCalcData = {
      items,
      bom,
      total,
      markup,
      clientPrice,
      code: calcParsed?.code,
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

    // В фоновом воркере (без запроса) revalidatePath может бросить — не валим
    // успешный расчёт (результат уже сохранён выше).
    try {
      revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
    } catch {
      /* вне request-scope — игнорируем */
    }
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
