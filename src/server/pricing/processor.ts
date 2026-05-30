/**
 * Универсальный процессор позиции оборудования: equipment[] → BomLine[].
 *
 * Для каждой позиции из Kimi (equipment[]):
 *   1) Каскад БД (catalog по категории) — точный матч.
 *   2) Веб (Kimi search) — для категорий без БД-прайса (ШУ, баки, обвязка...).
 *   3) Оценка (только для работ/услуг — формула из методички).
 *
 * Источник промптов веб-поиска — настройки (приоритет брендов, сайты).
 */

import { runKimiAgent } from '@/server/ai/kimi-agent';
import { getPricingSettings } from './settings';
import {
  findCollectorInDb,
  findJockeyPipingInDb,
  findPumpInDbBySku,
} from './equipment';
import { findCollectorPrice, collectorWeldingWorkRub } from '@/lib/pricing/collectors';
import type { BomLine, EquipmentReq } from '@/server/actions/kimi-calc';

interface WebItem {
  model?: string;
  article?: string;
  supplier?: string;
  priceRub?: number;
  url?: string;
  note?: string;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseWebJson(output: string): WebItem | null {
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
        url: o.url ? String(o.url) : undefined,
        note: o.note ? String(o.note) : undefined,
      };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Универсальный веб-поиск одной позиции (по описанию категории и требованиям). */
async function findInWeb(eq: EquipmentReq, hint: string): Promise<WebItem | null> {
  const s = await getPricingSettings();
  const sitesLine = Object.entries(s.brandSites)
    .map(([brand, url]) => `  • ${brand} → ${url}`)
    .join('\n');
  try {
    const { output } = await runKimiAgent({
      prompt:
        `Найди в интернете (web search, 1-2 запроса) конкретную позицию для насосной станции.\n` +
        `Категория: ${eq.category}\n` +
        `Наименование: ${eq.name}\n` +
        `Требования: ${JSON.stringify(eq.req ?? {})}\n` +
        (hint ? `Подсказка: ${hint}\n` : '') +
        `ПРИОРИТЕТ ИСТОЧНИКОВ — официальные сайты производителей в РФ:\n` +
        sitesLine + '\n' +
        `Бренды в приоритете: ${s.brandPriority.join(', ')}.\n` +
        `Верни СТРОГО JSON-блоком \`\`\`json {"model":"...","article":"...","priceRub":число,"supplier":"...","url":"https://полный-url-страницы","note":"наличие/срок"} \`\`\`. ` +
        `URL ОБЯЗАТЕЛЕН — конкретная страница товара (не главная). ` +
        `Цену бери из найденного; не нашёл — priceRub оставь null.`,
      timeoutMs: 6 * 60 * 1000,
    });
    return parseWebJson(output);
  } catch (e) {
    console.warn(`[processor] веб-поиск ${eq.category} «${eq.name}» не удался:`, e);
    return null;
  }
}

/**
 * Превращает одну позицию equipment[] в BomLine с правильным каскадом БД→веб→оценка.
 * Возвращает null для категорий «работы» — их добавляет отдельно собиратель сметы.
 */
export async function processEquipmentItem(eq: EquipmentReq): Promise<BomLine | null> {
  const qty = eq.qty ?? 1;
  const cat = eq.category.toLowerCase();
  const req = eq.req ?? {};

  // ─── НАСОС / ЖОКЕЙ ───
  if (cat === 'pump' || cat === 'jockey') {
    // Для жокея/основного — позже добавляются варианты optimum/reserve/economy
    // отдельно (см. processPump в kimi-calc). Здесь — простой матч в БД по SKU
    // если он есть в req.sku / req.model.
    const skuHint = String(req.sku ?? req.model ?? req.article ?? '');
    if (skuHint) {
      const found = await findPumpInDbBySku(skuHint);
      if (found?.priceRub != null) {
        return {
          name: `${eq.name} ${found.sku}`,
          article: found.sku,
          supplier: found.manufacturer,
          priceRub: found.priceRub,
          qty,
          sum: found.priceRub * qty,
          note: found.note,
          source: 'db',
        };
      }
    }
    // Если SKU не задан — оставляем веб-варианты обработать в основном цикле.
    return null;
  }

  // ─── КОЛЛЕКТОР ───
  if (cat === 'collector') {
    const dnSuc = num(req.dn_suction);
    const dnDis = num(req.dn_discharge);
    const nP = num(req.n_pumps);
    const dnNoz = num(req.dn_nozzle);
    const material = req.material ? String(req.material) : undefined;
    if (dnSuc != null && nP != null) {
      const dbColl = await findCollectorInDb({
        dnSuction: dnSuc,
        dnDischarge: dnDis,
        nPumps: nP,
        dnNozzle: dnNoz,
        material,
      });
      if (dbColl?.priceRub != null) {
        return {
          name: dbColl.name,
          article: dbColl.sku,
          supplier: dbColl.manufacturer,
          priceRub: dbColl.priceRub,
          qty,
          sum: dbColl.priceRub * qty,
          note: dbColl.note,
          source: 'db',
        };
      }
      // Fallback на md-прайс по шифру
      const code = `${dnSuc}${dnDis ? `/${dnDis}` : ''}-${nP}${dnNoz ? `-${dnNoz}` : ''}`;
      const md = findCollectorPrice(code, material);
      if (md) {
        return {
          name: `Коллектор ${code}`,
          article: code,
          priceRub: md.priceRub,
          qty,
          sum: md.priceRub * qty,
          note: md.exact ? `md-прайс: ${md.source}` : `ориентир: ${md.source}`,
          source: 'estimate',
        };
      }
    }
    return null;
  }

  // ─── ОБВЯЗКА ЖОКЕЯ ─── (категория jockey_piping или похожая)
  if (cat === 'jockey_piping' || cat === 'jockey-piping') {
    const pmax = num(req.pressure_max_mpa) ?? 1.0;
    const jp = await findJockeyPipingInDb(pmax);
    if (jp?.priceRub != null) {
      return {
        name: jp.name,
        article: jp.sku,
        supplier: jp.manufacturer,
        priceRub: jp.priceRub,
        qty,
        sum: jp.priceRub * qty,
        note: jp.note,
        source: 'db',
      };
    }
    return null;
  }

  // ─── РАБОТЫ КОЛЛЕКТОРА ─── особый кейс: формула по DN
  if (cat === 'collector_works' || cat === 'works') {
    const dn = num(req.dn) ?? num(req.dn_suction) ?? 100;
    const price = collectorWeldingWorkRub(dn);
    return {
      name: eq.name || 'Работы (сварка коллектора)',
      priceRub: price,
      qty,
      sum: price * qty,
      note: `по DN${dn} (методика)`,
      source: 'estimate',
    };
  }

  // ─── ВСЕ ОСТАЛЬНЫЕ (ШУ, бак, реле, манометры, виброопоры, клапаны, ...) ───
  // Веб-поиск. Подсказка — по категории.
  const hint = hintForCategory(cat, req);
  const web = await findInWeb(eq, hint);
  if (web?.priceRub != null) {
    return {
      name: `${eq.name}${web.model ? ` ${web.model}` : ''}`,
      article: web.article,
      supplier: web.supplier,
      priceRub: web.priceRub,
      qty,
      sum: web.priceRub * qty,
      note: web.note,
      source: 'web',
      sourceUrl: web.url,
    };
  }
  // Если веб не нашёл цену — отдаём позицию с пометкой «цена не определена».
  return {
    name: eq.name,
    qty,
    note: `цена не определена; req=${JSON.stringify(req)}`,
    source: 'estimate',
  };
}

function hintForCategory(cat: string, req: Record<string, unknown>): string {
  switch (cat) {
    case 'shu':
    case 'cabinet':
      return `Шкаф управления насосами — серия Шторм ШУФ/ШУФС (для G-Fire), ШУЧ (для ВНС с ЧРП), номинал по мотору ${req.motor_kW ?? '?'} кВт, число насосов из третьей цифры кода (213/223→1-2, 323→3). Опции: АВР, Жн, Эз, УХЛ1. Бренды: Гидрострой-НН (Шторм), Омега (для Wellmix/NES), Рутек.`;
    case 'tank':
    case 'reservoir':
      return `Резервуар пожарного запаса воды объёмом ${req.volume_m3 ?? '?'} м³; материал: ${req.material ?? 'стеклопластик G-Drum для подземки, металл для наземки'}; обычно 2 шт. для резервирования. Производители: G-Drum (Гидрострой), Steklomet, прочие.`;
    case 'vfd':
      return `Частотный преобразователь под мотор ${req.motor_kW ?? '?'} кВт; бренды Schneider Altivar, Danfoss, Веспер, Веста.`;
    case 'valve':
    case 'check_valve':
      return `Затвор/обратный клапан DN${req.dn ?? '?'} мм по ГОСТ; чугун/нерж. Производители: BROEN, Tecofi, AlfaValve.`;
    case 'pressure_switch':
    case 'gauge':
    case 'sensor':
      return `Электрика/КИП: реле давления, манометры, реле потока, поплавки. Бренды Danfoss, ОВЕН, Реле и Автоматика.`;
    case 'compressor':
      return `Компрессор для воздушной АУПТ; производительность по req.air_capacity или площади защиты.`;
    case 'drainage_pump':
      return `Дренажный насос для подземной станции (моноблочный, погружной). Серия CNP SDS / Pedrollo BCm. Для удаления подтоплений из приямка.`;
    case 'vacuum_pump':
      return `Вакуумный водокольцевой насос для самовсасывающей береговой ПНС. Бренды: Везер, CNP SHV.`;
    case 'foot_valve':
    case 'suction_hose':
      return `Донный клапан с сеткой / заборный рукав DN${req.dn ?? '?'} для береговой самовсасывающей ПНС.`;
    case 'mpt_branch':
      return `Патрубок МПТ DN80 с соединительной головкой для наружного пожаротушения (СП 10.13130). Обычно 2 шт.`;
    case 'vibro_mount':
      return `Виброопоры под раму насосной установки, грузоподъёмность по мотору.`;
    case 'pipe_fitting':
      return `Фланцы/тройники/переходы по ГОСТ 17376 — фасонные части коллектора.`;
    default:
      return `Позиция для насосной станции, найди в каталогах CNP / Wilo / Grundfos или отечественных производителей с учётом требований.`;
  }
}
