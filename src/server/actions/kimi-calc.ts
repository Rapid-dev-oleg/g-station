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
  upsertPumpFromWeb,
} from '@/server/pricing/equipment';

/** Скил расчёта по типу системы (сейчас один — пожарные/водоснабжение). */
function skillForType(_typeCode: string): string {
  return 'pump-station-calc';
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
}

/**
 * Находит конкретную модель насоса и цену через ПРОСТОЙ веб-поиск Kimi-агента
 * (одна задача — стабильно укладывается в таймаут, в отличие от «подбор+смета»).
 */
async function findPumpPrice(p: {
  pumpClass: string;
  motor: string;
  q?: number;
  h?: number;
}): Promise<PumpFound | null> {
  try {
    const { output } = await runKimiAgent({
      prompt:
        `Найди в интернете (web search, 1-2 запроса) конкретный насос для пожарной/водяной ` +
        `станции под рабочую точку Q=${p.q ?? '?'} м³/ч, H=${p.h ?? '?'} м, класс «${p.pumpClass}», ` +
        `мотор ${p.motor}. ` +
        `ПРИОРИТЕТ ИСТОЧНИКОВ — официальные сайты производителей в РФ:\n` +
        `  • CNP → https://www.cnprussia.ru (приоритет №1; site:cnprussia.ru)\n` +
        `  • Wilo → wilo.com/ru\n` +
        `  • Grundfos → grundfos.ru\n` +
        `  • Wellmix → wellmix.ru\n` +
        `Сначала ищи на официальном сайте бренда — там каноничные артикулы и характеристики. ` +
        `Если на официальном цены нет — возьми из крупного магазина-дилера, но article и model — ` +
        `всегда из официального источника.\n` +
        `Бренд по умолчанию — CNP. Альтернативы — Wilo / Grundfos / Wellmix.\n` +
        `Верни СТРОГО JSON-блоком \`\`\`json {"model":"...","article":"...","priceRub":число,"supplier":"сайт/магазин","note":"наличие/срок"} \`\`\`. ` +
        `Цену бери из найденного, не выдумывай; не нашёл — priceRub оставь null.`,
      timeoutMs: 6 * 60 * 1000,
    });
    const fence = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    const a = output.indexOf('{');
    const z = output.lastIndexOf('}');
    const cands = [fence?.[1], a >= 0 && z > a ? output.slice(a, z + 1) : null].filter(Boolean) as string[];
    for (const c of cands) {
      try {
        const o = JSON.parse(c.trim()) as Record<string, unknown>;
        return {
          model: o.model ? String(o.model) : undefined,
          article: o.article ? String(o.article) : undefined,
          supplier: o.supplier ? String(o.supplier) : undefined,
          priceRub: num(o.priceRub),
          note: o.note ? String(o.note) : undefined,
        };
      } catch {
        /* next */
      }
    }
    return null;
  } catch (e) {
    console.warn('[kimi-calc] веб-поиск насоса не удался:', e);
    return null;
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

type ParsedCalc = Pick<KimiCalcData, 'items' | 'bom' | 'total' | 'markup' | 'clientPrice' | 'code'>;

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
      if (Array.isArray(obj.items) || Array.isArray(obj.bom)) {
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
        return {
          items,
          bom,
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
      skill: skillForType(system.typeCode),
      prompt:
        'Рассчитай насосную станцию по карточке (методика скила). Дай: рабочую точку, ' +
        'схему, класс насоса, мотор (кВт), коллектор (DN + материал), жокей, ШУ, ' +
        'объём пожарного запаса, шифр изделия — каждое с кратким обоснованием. ' +
        'НЕ включай в результат строки «Точная модель насоса», «Производитель/бренд», ' +
        '«Коэффициент наценки» — точную модель и поставщика найдёт следующий этап ' +
        '(веб-поиск), наценка считается в коде. НЕ ищи в интернете на этом шаге. ' +
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
    const pump = await findPumpPrice({ pumpClass, motor, q: q ?? undefined, h: h ?? undefined });

    // Смета: каскад БД → веб → оценка для каждой позиции.
    const qty = pumpCountFromItems(items);
    const bom: BomLine[] = [];

    // ─── НАСОС ─── веб даёт точную модель/SKU, потом lookup в БД CNP.
    if (pump) {
      const dbPump = await findPumpInDbBySku(pump.article ?? pump.model);
      // Не нашли в БД но веб дал валидные данные → upsert (пополняем catalog).
      if (!dbPump && pump.priceRub != null && (pump.article || pump.model)) {
        await upsertPumpFromWeb({
          model: pump.model,
          article: pump.article,
          priceRub: pump.priceRub,
          supplier: pump.supplier,
          note: pump.note,
        }).catch(() => undefined); // upsert не должен ломать расчёт
      }
      // Если в БД нашли — используем нашу цену прайса CNP; веб — как альтернатива.
      const useDb = dbPump?.priceRub != null;
      const priceRub = useDb ? dbPump!.priceRub : pump.priceRub;
      const article = useDb ? dbPump!.sku : pump.article;
      const supplier = useDb ? `${dbPump!.manufacturer} (прайс БД)` : pump.supplier;
      const noteParts = [
        useDb ? `БД CNP` : `веб: ${pump.supplier ?? '—'}`,
        useDb && pump.priceRub != null
          ? `веб-альтернатива: ${pump.priceRub.toLocaleString('ru-RU')} ₽ ${pump.supplier ?? ''}`
          : '',
        pump.note,
      ].filter(Boolean);
      bom.push({
        name: `Насос ${pump.model ?? pumpClass}`,
        article,
        supplier,
        priceRub: priceRub ?? undefined,
        qty,
        sum: priceRub != null ? priceRub * qty : undefined,
        note: noteParts.join(' · '),
      });
    }

    // ─── КОЛЛЕКТОР ─── 1) БД Gfire (43 точки) 2) md-прайс по шифру 3) оценка.
    const collectorMaterial = items.find((i) => /материал коллектор/i.test(i.param))?.value;
    const collectorDn = items.find((i) => /коллектор/i.test(i.param))?.value;
    const collectorCode = calcParsed?.code ?? collectorDn ?? '';
    // Парсим шифр "Dвсас[/Dнапор]-N[-dпатрубок]" для поиска в БД.
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
      });
    } else {
      const coll = findCollectorPrice(collectorCode, collectorMaterial);
      if (coll) {
        bom.push({
          name: 'Материалы коллектора',
          article: collectorCode,
          priceRub: coll.priceRub,
          qty: 1,
          sum: coll.priceRub,
          note: coll.exact ? `md-прайс: ${coll.source}` : `ориентир: ${coll.source}`,
        });
      } else {
        bom.push({ name: 'Материалы коллектора', priceRub: 95000, qty: 1, sum: 95000, note: 'оценочно (нет точки в прайсе)' });
      }
      // Работы — только если в БД нет коллектора (там работы уже включены в total).
      const dnSucMatch = (collectorCode || '').match(/(\d+)/);
      const dnSuc = dnSucMatch ? +dnSucMatch[1] : 100;
      const weld = collectorWeldingWorkRub(dnSuc);
      bom.push({
        name: 'Работы (сварка коллектора/рамы, расключение)',
        priceRub: weld,
        qty: 1,
        sum: weld,
        note: `по DN${dnSuc} (методика)`,
      });
    }

    // ─── ОБВЯЗКА ЖОКЕЯ ─── если в items упомянут жокей.
    const hasJockey = items.some((i) => /жокей/i.test(i.param) || /жокей/i.test(i.value));
    if (hasJockey) {
      const jp = await findJockeyPipingInDb(1.0);
      if (jp?.priceRub != null) {
        bom.push({
          name: jp.name,
          article: jp.sku,
          supplier: jp.manufacturer,
          priceRub: jp.priceRub,
          qty: 1,
          sum: jp.priceRub,
          note: jp.note,
        });
      }
    }

    // ─── ШУ ─── прайса в БД нет, оценка.
    bom.push({ name: `Шкаф управления (${motor || 'по мотору'})`, priceRub: 185000, qty: 1, sum: 185000, note: 'оценочно (прайса ШУ нет)' });

    const total = bom.reduce((s, b) => s + (b.sum ?? 0), 0);
    const markup = 1.7;
    const clientPrice = Math.round(total * markup);

    const output =
      calcOut + (pump ? `\n\n=== ПОДБОР (веб) ===\n${JSON.stringify(pump, null, 2)}` : '');
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
