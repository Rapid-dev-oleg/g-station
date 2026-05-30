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
import { findCollectorPrice, collectorWeldingWorkRub } from '@/lib/pricing/collectors';
import {
  findCollectorInDb,
  findJockeyPipingInDb,
  findPumpInDbBySku,
} from '@/server/pricing/equipment';
import { processEquipmentItem } from '@/server/pricing/processor';
import { getPricingSettings } from '@/server/pricing/settings';

/** Скил расчёта по типу системы — из реестра SystemType (fallback на дефолт). */
async function skillForType(typeCode: string): Promise<string> {
  const t = await db.systemType.findUnique({
    where: { code: typeCode },
    select: { skillName: true },
  });
  return t?.skillName ?? 'pump-station-calc';
}

/** Число насосов по схеме (из строки items «Схема»). */
function pumpCountFromItems(items: CalcItem[]): number {
  const scheme = items.find((i) => /схема/i.test(i.param))?.value ?? '';
  const m = scheme.match(/(\d)\s*\/\s*(\d)/);
  if (m) return Number(m[1]) + Number(m[2]);
  return 2;
}

interface PumpFound {
  model?: string;
  article?: string;
  supplier?: string;
  priceRub?: number;
  note?: string;
  /** URL страницы оборудования (на сайте производителя/магазина). */
  url?: string;
  /** Уровень варианта: optimum — точно под рабочую точку, reserve — с запасом,
   *  economy — самый дешёвый из подходящих. */
  tier?: 'optimum' | 'reserve' | 'economy';
}

/**
 * Находит конкретную модель насоса и цену через ПРОСТОЙ веб-поиск Kimi-агента
 * (одна задача — стабильно укладывается в таймаут, в отличие от «подбор+смета»).
 */
async function findPumpOptions(p: {
  pumpClass: string;
  motor: string;
  q?: number;
  h?: number;
}): Promise<PumpFound[]> {
  try {
    const { output } = await runKimiAgent({
      prompt:
        `Подбери в интернете (web search, 2-3 запроса) НЕСКОЛЬКО вариантов насоса ` +
        `для пожарной/водяной станции под рабочую точку Q=${p.q ?? '?'} м³/ч, ` +
        `H=${p.h ?? '?'} м, класс «${p.pumpClass}», мотор ${p.motor}.\n` +
        `Верни 3 варианта (если есть на рынке):\n` +
        `  • "optimum" — точно под рабочую точку, минимальный избыток;\n` +
        `  • "reserve" — на типоразмер выше (запас по Q или H 15–30%);\n` +
        `  • "economy" — дешевле optimum при сохранении рабочей точки.\n` +
        `ПРИОРИТЕТ ИСТОЧНИКОВ — официальные сайты производителей в РФ:\n` +
        `  • CNP → https://www.cnprussia.ru (приоритет №1; site:cnprussia.ru)\n` +
        `  • Wilo → wilo.com/ru\n` +
        `  • Grundfos → grundfos.ru\n` +
        `  • Wellmix → wellmix.ru\n` +
        `Бренд по умолчанию — CNP. Альтернативы — Wilo/Grundfos/Wellmix.\n` +
        `Верни СТРОГО JSON-массивом:\n` +
        '```json\n' +
        '[\n' +
        '  {"tier":"optimum","model":"...","article":"...","priceRub":число,"supplier":"...","url":"https://...","note":"..."},\n' +
        '  {"tier":"reserve","model":"...","article":"...","priceRub":число,"supplier":"...","url":"https://...","note":"..."},\n' +
        '  {"tier":"economy","model":"...","article":"...","priceRub":число,"supplier":"...","url":"https://...","note":"..."}\n' +
        ']\n' +
        '```\n' +
        `URL ОБЯЗАТЕЛЕН для каждого — конкретная страница товара (не главная). ` +
        `Цену бери из найденного, не выдумывай; не нашёл вариант — пропусти его в массиве.`,
      timeoutMs: 8 * 60 * 1000,
    });
    const fence = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    const a = output.indexOf('[');
    const z = output.lastIndexOf(']');
    const cands = [fence?.[1], a >= 0 && z > a ? output.slice(a, z + 1) : null].filter(Boolean) as string[];
    for (const c of cands) {
      try {
        const parsed = JSON.parse(c.trim());
        const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        const out: PumpFound[] = [];
        for (const v of arr) {
          if (!v || typeof v !== 'object') continue;
          const o = v as Record<string, unknown>;
          out.push({
            tier: (['optimum', 'reserve', 'economy'] as const).find((t) => t === o.tier) ?? undefined,
            model: o.model ? String(o.model) : undefined,
            article: o.article ? String(o.article) : undefined,
            supplier: o.supplier ? String(o.supplier) : undefined,
            priceRub: num(o.priceRub),
            note: o.note ? String(o.note) : undefined,
            url: o.url ? String(o.url) : undefined,
          });
        }
        if (out.length > 0) return out;
      } catch {
        /* next */
      }
    }
    return [];
  } catch (e) {
    console.warn('[kimi-calc] подбор насоса не удался:', e);
    return [];
  }
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
    });

    // Структурируем характеристики (фаза 1).
    const calcParsed = extractCalcJson(calcOut) ?? (await structureViaChat(calcOut));
    const items = (calcParsed?.items ?? []).filter(
      (it) => !/точная модель|производител|бренд|коэффициент наценк/i.test(it.param),
    );

    // ── Фаза 2: ПРОСТОЙ веб-поиск цены насоса (смету собираем в коде ниже). ──
    // Полный «подбор + смета + JSON» одним агентом не укладывался в таймаут;
    // здесь агент делает только то, что стабильно — находит модель и цену.
    const pumpClass = items.find((i) => /класс насоса/i.test(i.param))?.value ?? '';
    const motor = items.find((i) => /мотор/i.test(i.param))?.value ?? '';
    const q = card.input.Q?.value ?? undefined;
    const h = card.input.H?.value ?? undefined;
    const pumpOptions = await findPumpOptions({
      pumpClass,
      motor,
      q: q ?? undefined,
      h: h ?? undefined,
    });

    // ─── Сборка сметы: цикл по equipment[] из расчёта Kimi ───
    // НЕТ захардкоженного списка позиций. Если Kimi не вернул equipment —
    // упадём на минимальный набор (насос + коллектор + ШУ) для обратной совместимости.
    const qty = pumpCountFromItems(items);
    const bom: BomLine[] = [];
    const equipment: EquipmentReq[] = calcParsed?.equipment ?? [];
    const settings = await getPricingSettings();

    // НАСОС (категория pump): 3 варианта optimum/reserve/economy через веб + lookup в БД.
    // Эта позиция остаётся обработана отдельно: для неё специальный multi-variant поиск.
    const pumpEq = equipment.find((e) => /^pump$/i.test(e.category)) ?? {
      category: 'pump',
      name: 'Насос основной',
      qty,
    };
    if (pumpOptions.length > 0) {
      const lines: BomLine[] = [];
      for (const opt of pumpOptions) {
        const dbPump = await findPumpInDbBySku(opt.article ?? opt.model);
        const useDb = dbPump?.priceRub != null;
        const priceRub = useDb ? dbPump!.priceRub : opt.priceRub;
        const article = useDb ? dbPump!.sku : opt.article;
        const supplier = useDb ? dbPump!.manufacturer : opt.supplier;
        const noteParts = [
          useDb && opt.priceRub != null
            ? `веб-альтернатива: ${opt.priceRub.toLocaleString('ru-RU')} ₽ ${opt.supplier ?? ''}`
            : '',
          opt.note,
        ].filter(Boolean);
        lines.push({
          name: `Насос ${opt.model ?? pumpClass}`,
          article,
          supplier,
          priceRub: priceRub ?? undefined,
          qty: pumpEq.qty ?? qty,
          sum: priceRub != null ? priceRub * (pumpEq.qty ?? qty) : undefined,
          note: noteParts.join(' · ') || undefined,
          source: useDb ? 'db' : 'web',
          sourceUrl: !useDb ? opt.url : undefined,
          tier: opt.tier,
        });
      }
      const main = lines.find((l) => l.tier === 'optimum') ?? lines[0];
      const alternatives = lines.filter((l) => l !== main);
      bom.push({ ...main, alternatives });
    }

    // ВСЕ ОСТАЛЬНЫЕ ПОЗИЦИИ — диспатч через processEquipmentItem (БД→веб→оценка).
    // Если equipment[] пустой — добавим хотя бы коллектор/ШУ из items (старая логика).
    if (equipment.length > 0) {
      for (const eq of equipment) {
        if (/^pump$/i.test(eq.category)) continue; // насос уже выше
        const line = await processEquipmentItem(eq);
        if (line) bom.push(line);
      }
    } else {
      // Fallback: минимальный набор по items (если equipment[] не пришёл).
      const collectorMaterial = items.find((i) => /материал коллектор/i.test(i.param))?.value;
      const collectorDn = items.find((i) => /коллектор/i.test(i.param))?.value;
      const collectorCode = calcParsed?.code ?? collectorDn ?? '';
      const cMatch = (collectorCode || '').match(/(\d+)(?:\/(\d+))?[-\s](\d+)(?:[-\s](\d+))?/);
      const dbCollector = cMatch
        ? await findCollectorInDb({
            dnSuction: +cMatch[1],
            dnDischarge: cMatch[2] ? +cMatch[2] : undefined,
            nPumps: +cMatch[3],
            dnNozzle: cMatch[4] ? +cMatch[4] : undefined,
            material: collectorMaterial ?? undefined,
          })
        : null;
      if (dbCollector?.priceRub != null) {
        bom.push({
          name: dbCollector.name,
          article: dbCollector.sku,
          supplier: dbCollector.manufacturer,
          priceRub: dbCollector.priceRub,
          qty: 1,
          sum: dbCollector.priceRub,
          note: dbCollector.note,
          source: 'db',
        });
      } else if (collectorCode) {
        const md = findCollectorPrice(collectorCode, collectorMaterial);
        if (md) {
          bom.push({
            name: 'Материалы коллектора',
            article: collectorCode,
            priceRub: md.priceRub,
            qty: 1,
            sum: md.priceRub,
            note: md.exact ? `md-прайс: ${md.source}` : `ориентир: ${md.source}`,
            source: 'estimate',
          });
        }
        const dnSucMatch = collectorCode.match(/(\d+)/);
        const dnSuc = dnSucMatch ? +dnSucMatch[1] : 100;
        const weld = collectorWeldingWorkRub(dnSuc);
        bom.push({
          name: 'Работы (сварка коллектора/рамы, расключение)',
          priceRub: weld,
          qty: 1,
          sum: weld,
          note: `по DN${dnSuc} (методика)`,
          source: 'estimate',
        });
      }
      // ШУ через веб (без хардкода 185 000).
      const shu = await processEquipmentItem({
        category: 'shu',
        name: 'Шкаф управления',
        qty: 1,
        req: { motor_kW: motor, start_type: 'прямой' },
      });
      if (shu) bom.push(shu);
    }

    const total = bom.reduce((s, b) => s + (b.sum ?? 0), 0);
    const markup = settings.clientMarkup;
    const clientPrice = Math.round(total * markup);

    const output =
      calcOut +
      (pumpOptions.length > 0
        ? `\n\n=== ПОДБОР (веб, варианты) ===\n${JSON.stringify(pumpOptions, null, 2)}`
        : '');
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
