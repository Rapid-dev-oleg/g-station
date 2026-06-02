/**
 * Подбор и цена позиций станции — ОДИН агентный проход (этап C конвейера).
 *
 * Принцип: всю работу делает LLM-агент, у него есть MCP-инструменты к нашей БД
 * (search_catalog / find_collector / find_pump_by_sku / find_jockey_piping) и
 * веб-поиск. Кода-методики тут НЕТ — он не маршрутизирует по категориям и не
 * считает цены сам. Задача кода: дать агенту список и ГАРАНТИРОВАТЬ, что каждая
 * входная позиция оборудования вернётся строкой сметы (если цены нет — estimate).
 *
 * Источник насоса по приоритету (в промпте): подборщик CNP (когда подключим) →
 * наша БД → веб → оценка. Бренды/сайты — из настроек (RuleConfig brand-priority),
 * НЕ из литералов.
 */

import { runKimiAgent } from '@/server/ai/kimi-agent';
import { getPricingSettings } from './settings';
import type { BomLine, EquipmentReq } from '@/server/actions/kimi-calc';

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Строка-оценка прямо из позиции equipment (без методики, без выдуманной цены). */
function estimateLine(eq: EquipmentReq): BomLine {
  return {
    name: eq.name,
    qty: eq.qty ?? 1,
    note: `цена не определена; req=${JSON.stringify(eq.req ?? {})}`,
    source: 'estimate',
  };
}

/** Все позиции как estimate — аварийный путь, если агент не вернул ничего. */
export function estimateLinesFromEquipment(equipment: EquipmentReq[]): BomLine[] {
  return equipment.map(estimateLine);
}

/** Парсит JSON-массив сметы от агента в [{idx, line}]. */
function parseAgentBom(output: string): { idx?: number; line: BomLine }[] {
  const fence = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const a = output.indexOf('[');
  const z = output.lastIndexOf(']');
  const cands = [fence?.[1], a >= 0 && z > a ? output.slice(a, z + 1) : null].filter(Boolean) as string[];
  for (const c of cands) {
    try {
      const parsed = JSON.parse(c.trim()) as Record<string, unknown>[];
      if (!Array.isArray(parsed)) continue;
      return parsed.map((o) => {
        const qty = num(o.qty) ?? 1;
        const priceRub = num(o.priceRub);
        const source = (o.source === 'db' || o.source === 'web' ? o.source : 'estimate') as BomLine['source'];
        return {
          idx: num(o.idx),
          line: {
            name: String(o.name ?? 'Позиция'),
            article: o.article ? String(o.article) : undefined,
            supplier: o.supplier ? String(o.supplier) : undefined,
            priceRub,
            qty,
            sum: priceRub != null ? priceRub * qty : undefined,
            note: o.note ? String(o.note) : undefined,
            source,
            sourceUrl: o.url ? String(o.url) : undefined,
            tier: (['optimum', 'reserve', 'economy'] as const).find((t) => t === o.tier) ?? undefined,
          },
        };
      });
    } catch {
      /* следующий кандидат */
    }
  }
  return [];
}

/**
 * Цена ВСЕГО списка equipment[] (включая основной насос) одним агентным проходом.
 *
 * Агент по каждой позиции сам решает: МСP к БД → веб → оценка. Возвращает строку
 * на КАЖДУЮ позицию (по idx). Инвариант: длина результата = длине входа; позиции,
 * которые агент пропустил/не нашёл, добиваются estimate из equipment[]. Насос
 * НИКОГДА не теряется. Никогда не кидает и не возвращает null.
 */
export async function priceEquipment(equipment: EquipmentReq[]): Promise<BomLine[]> {
  if (equipment.length === 0) return [];
  const s = await getPricingSettings();
  const sitesLine = Object.entries(s.brandSites)
    .map(([brand, url]) => `  • ${brand} → ${url}`)
    .join('\n');
  const list = equipment
    .map((eq, i) => `${i}. категория=${eq.category}; наименование=${eq.name}; qty=${eq.qty ?? 1}; req=${JSON.stringify(eq.req ?? {})}`)
    .join('\n');

  let parsed: { idx?: number; line: BomLine }[] = [];
  try {
    const { output } = await runKimiAgent({
      timeoutMs: 8 * 60 * 1000,
      prompt:
        'Подбери конкретные модели и цены для позиций насосной станции. ' +
        'У тебя есть MCP-инструменты к нашей БД — используй их ПЕРЕД веб-поиском:\n' +
        '  • find_pump_by_sku(sku) — насос по артикулу;\n' +
        '  • find_collector(dn_suction,dn_discharge,n_pumps,dn_nozzle,material) — коллектор;\n' +
        '  • find_jockey_piping(pressure_max_mpa) — обвязка жокея;\n' +
        '  • search_catalog(category,query,limit) — ШУ (panels), баки (tanks), пр.\n\n' +
        'ОСНОВНОЙ НАСОС (category=pump): подбери по рабочей точке Q/H и классу из req. ' +
        'Если в req есть конкретная модель/артикул — find_pump_by_sku; иначе веб-поиск ' +
        'по классу/Q/H. Точную модель и бренд утверждает инженер (правило 3.11), но ты ' +
        'ОБЯЗАН предложить вариант-ориентир (optimum) — не оставляй насос без строки. ' +
        'Если в req есть аналог из ТЗ — отталкивайся от него.\n\n' +
        'Если позиции нет в БД — веб-поиск (цена в рублях). Цены прайса CNP в БД в USD — ' +
        'переведи в рубли по курсу ' + s.usdRub + ' (поле currency подскажет).\n\n' +
        'ПРИОРИТЕТ брендов: ' + s.brandPriority.join(', ') + ' (CNP — по умолчанию).\n' +
        'Официальные сайты РФ:\n' + sitesLine + '\n\n' +
        'ПОЗИЦИИ (сохрани индексы idx):\n' + list + '\n\n' +
        'Верни СТРОГО JSON-массивом, ПО ЭЛЕМЕНТУ НА КАЖДЫЙ idx (не пропускай ни одной):\n' +
        '```json\n[{"idx":0,"name":"...","category":"...","article":"...","supplier":"...","priceRub":число|null,"qty":число,"source":"db|web|estimate","url":"...","tier":"optimum"}]\n```\n' +
        'priceRub — за единицу, в рублях. Не нашёл цену — priceRub:null, source:"estimate", ' +
        'но строку ВСЁ РАВНО верни. Не выдумывай цены и артикулы.',
    });
    parsed = parseAgentBom(output);
  } catch (e) {
    console.warn('[processor] агентный подбор не удался — все позиции оценкой:', e);
  }

  // Реконсиляция: на каждую входную позицию — ровно одна строка BOM.
  const byIdx = new Map<number, BomLine>();
  parsed.forEach((p, i) => {
    const key = p.idx ?? i;
    if (!byIdx.has(key)) byIdx.set(key, p.line);
  });
  return equipment.map((eq, i) => byIdx.get(i) ?? estimateLine(eq));
}
