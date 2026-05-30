/**
 * Поиск оборудования в каталоге (catalog) + fallback на веб.
 *
 * Каскад на каждую позицию:
 *   1) БД (точный матч по характеристикам) — мгновенно, точная цена RUB.
 *   2) Веб (Kimi search) — для того, что в БД нет.
 *   3) upsert найденного в каталог — следующий запуск возьмёт из БД.
 *
 * Сейчас в БД (на 2026-05-30):
 *   pumps: 8622  (серии CDM/CDMF/CV/NIS/TD/WQ/...; Q/H в attrs ОТСУТСТВУЮТ —
 *                 матч только по SKU/серии. Цены 1390 RUB + 7232 USD.)
 *   collectors: 43  (Gfire нерж, attrs: dn_suction/discharge/nozzle, n_pumps,
 *                    material, cost_materials/work_*; готовая total в `price`)
 *   jockey-piping: 2  (≤1.0 МПа и 1.0…1.6 МПа, готовая обвязка с ценой)
 *   panels/reservoirs/works/accessories/vfd: пусто → веб+оценка.
 */

import { db } from '@/server/db';

export interface FoundItem {
  source: 'db' | 'web';
  sku?: string;
  name: string;
  manufacturer?: string;
  priceRub?: number;
  currency?: string;
  note?: string;
}

/** Цена позиции в RUB (если в БД хранится не в RUB — конвертация по курсу). */
function toRub(price: number | null | undefined, currency: string | null | undefined): number | undefined {
  if (price == null) return undefined;
  const c = (currency ?? 'RUB').toUpperCase();
  if (c === 'RUB') return price;
  // Курс — из env (USD_RUB/EUR_RUB), дефолт 92/100. На проде подменим точным.
  const usd = Number(process.env.USD_RUB) || 92;
  const eur = Number(process.env.EUR_RUB) || 100;
  if (c === 'USD') return Math.round(price * usd);
  if (c === 'EUR') return Math.round(price * eur);
  return price; // неизвестная валюта — отдаём как есть, виновный увидит сам
}

// ──────────────────────── КОЛЛЕКТОР ────────────────────────

export interface CollectorReq {
  dnSuction: number;
  dnDischarge?: number;
  nPumps: number;
  dnNozzle?: number; // патрубок насоса (всас/напор)
  material?: 'нержавеющая-сталь' | 'углеродистая-сталь' | string | null;
}

/**
 * Коллектор: точный матч в БД (43 точки Gfire). Возвращает null если в БД нет —
 * вызывающий код должен дернуть fallback (findCollectorPrice по md-прайсу).
 */
export async function findCollectorInDb(req: CollectorReq): Promise<FoundItem | null> {
  // Нормализация: разрешаем dn_suction = всас или dn_dis,
  // и точный/близкий nozzle.
  const candidates = await db.catalogItem.findMany({
    where: {
      categoryCode: 'collectors',
      active: true,
    },
    include: { manufacturer: true },
  });
  if (candidates.length === 0) return null;

  const wantNerz = /нерж|stainless/i.test(req.material ?? '');
  const scored = candidates
    .map((c) => {
      const a = (c.attributes ?? {}) as Record<string, unknown>;
      const dnSuc = Number(a.dn_suction);
      const dnDis = Number(a.dn_discharge ?? a.dn_suction);
      const nP = Number(a.n_pumps);
      const dnNoz = Number(a.dn_nozzle_discharge ?? a.dn_nozzle_suction);
      const mat = String(a.material ?? '');
      const matNerz = /нерж/i.test(mat);

      let score = 0;
      // Главный матч — точный DN всаса и число насосов.
      if (dnSuc === req.dnSuction) score += 50;
      else score -= Math.abs(dnSuc - req.dnSuction);
      if (nP === req.nPumps) score += 30;
      else score -= Math.abs(nP - req.nPumps) * 10;
      // dn нагнетания — если задано
      if (req.dnDischarge && dnDis === req.dnDischarge) score += 10;
      // патрубок насоса
      if (req.dnNozzle && dnNoz === req.dnNozzle) score += 10;
      else if (req.dnNozzle) score -= Math.abs((dnNoz || 0) - req.dnNozzle) / 5;
      // материал
      if (req.material && matNerz === wantNerz) score += 5;
      return { c, score, attr: a };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 70) return null; // слабый матч → не отдаём

  return {
    source: 'db',
    sku: best.c.sku,
    name: best.c.name,
    manufacturer: best.c.manufacturer.name,
    priceRub: toRub(best.c.price, best.c.currency),
    currency: best.c.currency ?? undefined,
    note: `БД: матч score=${best.score} (${best.attr.config})`,
  };
}

// ──────────────────────── ОБВЯЗКА ЖОКЕЯ ────────────────────────

export async function findJockeyPipingInDb(pressureMaxMpa?: number): Promise<FoundItem | null> {
  const items = await db.catalogItem.findMany({
    where: { categoryCode: 'jockey-piping', active: true },
    include: { manufacturer: true },
  });
  if (items.length === 0) return null;
  const p = pressureMaxMpa ?? 1.0;
  // Берём наименьшую подходящую по давлению.
  const fit = items
    .map((i) => ({ i, max: Number((i.attributes as Record<string, unknown> | null)?.pressure_max_mpa) || 1 }))
    .filter((x) => x.max >= p)
    .sort((a, b) => a.max - b.max)[0];
  const chosen = fit?.i ?? items[items.length - 1];
  return {
    source: 'db',
    sku: chosen.sku,
    name: chosen.name,
    manufacturer: chosen.manufacturer.name,
    priceRub: toRub(chosen.price, chosen.currency),
    currency: chosen.currency ?? undefined,
    note: `обвязка под ${p} МПа`,
  };
}

// ──────────────────────── НАСОС ────────────────────────

/**
 * Lookup насоса в БД по SKU/артикулу из веб-поиска.
 * Пробуем:
 *  1) точный SKU (case-insensitive);
 *  2) prefix-match (например `CDM85-4` найдёт `CDM85-4FSWPC` / `CDM85-4FSWPR`);
 *  3) substring (для случая «CNP CDM85-4» с лишним префиксом).
 */
export async function findPumpInDbBySku(skuOrArticle: string | undefined | null): Promise<FoundItem | null> {
  if (!skuOrArticle) return null;
  const raw = skuOrArticle.trim();
  // Убираем префикс «CNP», пробелы и т.п.
  const cleaned = raw.replace(/^\s*(CNP|Wellmix)\s*/i, '').trim();
  if (!cleaned) return null;

  // 1) точно
  let item = await db.catalogItem.findFirst({
    where: { categoryCode: 'pumps', sku: { equals: cleaned, mode: 'insensitive' }, active: true },
    include: { manufacturer: true },
  });
  // 2) prefix
  if (!item) {
    item = await db.catalogItem.findFirst({
      where: { categoryCode: 'pumps', sku: { startsWith: cleaned, mode: 'insensitive' }, active: true },
      include: { manufacturer: true },
    });
  }
  // 3) substring
  if (!item) {
    // Берём первый «опорный» сегмент SKU (например `CDM85-4` из `CDM85-4FSWPC`)
    const seg = cleaned.match(/^[A-Z]+\d+(?:-\d+)?/i)?.[0];
    if (seg && seg.length >= 4) {
      item = await db.catalogItem.findFirst({
        where: { categoryCode: 'pumps', sku: { contains: seg, mode: 'insensitive' }, active: true },
        include: { manufacturer: true },
      });
    }
  }
  if (!item) return null;

  return {
    source: 'db',
    sku: item.sku,
    name: item.name,
    manufacturer: item.manufacturer.name,
    priceRub: toRub(item.price, item.currency),
    currency: item.currency ?? undefined,
    note: `БД (${item.currency ?? 'RUB'}): ${item.sku}`,
  };
}

