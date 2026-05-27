/**
 * Парсер прайса коллекторов и обвязки жокей-насоса Гидрострой G-Fire (xlsx).
 *
 * Структура файла (один лист):
 *  - Заголовки секций «Gfire (нержа)» / «Gfire (черняга)» отделяют материал;
 *  - В каждой секции — таблица с колонками
 *      A: Конфигурация (формат скила: `D-N-d` или `Dвсас/Dнапор-N-dвсас/dнапор`)
 *      B: Материалы коллектора (₽)
 *      C: Стоимость работ — коллектор (₽)
 *      D: Стоимость работ — рама (₽)
 *      E: Стоимость работ — расключение (₽)
 *      F: Цена общая (₽)
 *  - В колонках I/J — отдельный блок «Обвязка жокей-насоса»:
 *      I3: «Номинальное давление системы», J3: «Материалы, руб»
 *      I5: «≤1,0 МПа» → J5 цена; I6: «1,0…1,6 МПа» → J6 цена;
 *      I9: «Расключение жокей-установки», I10: цена расключения.
 *
 * Возвращает разобранные позиции под `CatalogItem` без обращения к БД.
 * Импорт в БД делает `scripts/import-collectors.ts`.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import * as xlsx from 'xlsx';

// ─── Типы ────────────────────────────────────────────────────────────────

export type CollectorMaterial = 'нержавеющая-сталь' | 'углеродистая-сталь';

/** Разобранный шифр коллектора. */
export interface CollectorConfig {
  /** Исходная строка шифра — для лукапа в attributes.config. */
  raw: string;
  dnSuction: number;
  dnDischarge: number;
  nPumps: number;
  dnNozzleSuction: number;
  dnNozzleDischarge: number;
}

export interface CollectorRow {
  config: CollectorConfig;
  material: CollectorMaterial;
  costMaterials: number;
  costWorkCollector: number;
  costWorkFrame: number;
  costWorkRouting: number;
  priceTotal: number;
}

export interface JockeyKitRow {
  /** Верхняя граница давления, МПа (для лукапа: подойдёт первый kit с pressureMaxMpa ≥ системного). */
  pressureMaxMpa: number;
  /** Подпись из прайса — для UI/sku. */
  label: string;
  priceTotal: number;
}

export interface CollectorImportResult {
  collectors: CollectorRow[];
  jockeyKits: JockeyKitRow[];
  /** Стоимость расключения жокей-установки — отдельной строкой. */
  jockeyRouting: number | null;
  sourceFile: string;
  priceDate: Date;
  rejected: { line: number; reason: string; raw: string }[];
}

// ─── Хелперы ─────────────────────────────────────────────────────────────

/** Парсит «92,482.15 ₽» / «1,500.00 ₽» / 92482.15 → 92482.15. */
function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[\s₽]/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Парсит конфигурацию вида `D-N-d` или `Dвсас/Dнапор-N-dвсас/dнапор`.
 * Возвращает null, если строка не похожа на конфигурацию.
 */
export function parseCollectorConfig(raw: string): CollectorConfig | null {
  const m = /^\s*(\d+)(?:\/(\d+))?-(\d+)-(\d+)(?:\/(\d+))?\s*$/.exec(raw);
  if (!m) return null;
  const dnSuction = Number(m[1]);
  const dnDischarge = m[2] !== undefined ? Number(m[2]) : dnSuction;
  const nPumps = Number(m[3]);
  const dnNozzleSuction = Number(m[4]);
  const dnNozzleDischarge = m[5] !== undefined ? Number(m[5]) : dnNozzleSuction;
  return {
    raw: raw.trim(),
    dnSuction,
    dnDischarge,
    nPumps,
    dnNozzleSuction,
    dnNozzleDischarge,
  };
}

/** Парсит давление из подписи: «≤1,0 МПа» → 1.0; «1,0…1,6 МПа» → 1.6. */
function parsePressureMax(label: string): number | null {
  // Берём ПОСЛЕДНЕЕ число в строке — оно и есть верхняя граница диапазона.
  const matches = [...label.matchAll(/(\d+[,.]\d+|\d+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1][1].replace(',', '.');
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

/** Заголовок секции материала → CollectorMaterial. */
function detectSectionMaterial(cell: string): CollectorMaterial | null {
  const s = cell.toLowerCase();
  if (s.includes('gfire') && s.includes('нерж')) return 'нержавеющая-сталь';
  if (s.includes('gfire') && (s.includes('черняг') || s.includes('углерод'))) {
    return 'углеродистая-сталь';
  }
  return null;
}

// ─── Парсер ──────────────────────────────────────────────────────────────

/**
 * Читает xlsx-файл прайса коллекторов G-Fire и возвращает разобранные позиции.
 * Дата прайса берётся из mtime файла.
 */
export async function importGfireCollectorsXlsx(
  filePath: string,
): Promise<CollectorImportResult> {
  const buf = await readFile(filePath);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // raw:false — числа возвращаются как форматированные строки («92,482.15 ₽»),
  // что для нашего parseMoney удобно: единая ветка.
  const rows = xlsx.utils.sheet_to_json<(string | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const collectors: CollectorRow[] = [];
  const jockeyKits: JockeyKitRow[] = [];
  const rejected: { line: number; reason: string; raw: string }[] = [];
  let jockeyRouting: number | null = null;

  let material: CollectorMaterial | null = null;
  let expectJockeyRoutingNext = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const colA = row[0] != null ? String(row[0]).trim() : '';
    const colI = row[8] != null ? String(row[8]).trim() : '';
    const colJ = row[9];

    // ── Блок «Обвязка жокей-насоса» (колонки I/J) ─────────────────────
    if (colI) {
      // Цена расключения — ставим, когда увидели заголовок «Расключение …» строкой выше.
      if (expectJockeyRoutingNext) {
        const price = parseMoney(colI) ?? parseMoney(colJ);
        if (price != null) jockeyRouting = price;
        expectJockeyRoutingNext = false;
      } else if (/расключени/i.test(colI)) {
        // В прайсе цена находится в ЭТОЙ же ячейке (см. строку 10 файла: I="1,500.00 ₽").
        const sameRowPrice = parseMoney(colI);
        if (sameRowPrice != null) {
          jockeyRouting = sameRowPrice;
        } else {
          expectJockeyRoutingNext = true;
        }
      } else if (/мпа/i.test(colI)) {
        const price = parseMoney(colJ);
        const pMax = parsePressureMax(colI);
        if (price != null && pMax != null) {
          jockeyKits.push({ pressureMaxMpa: pMax, label: colI, priceTotal: price });
        }
      }
    }

    // ── Переключение секции материала ─────────────────────────────────
    if (colA) {
      const mat = detectSectionMaterial(colA);
      if (mat) {
        material = mat;
        continue;
      }
      if (colA.toLowerCase() === 'конфигурация') continue; // строка заголовка таблицы
    } else {
      continue;
    }

    // ── Строка коллектора ─────────────────────────────────────────────
    const config = parseCollectorConfig(colA);
    if (!config) {
      // не конфигурация — пропускаем (могут быть заголовки/служебные строки)
      continue;
    }
    if (!material) {
      rejected.push({ line: i + 1, reason: 'строка вне секции материала', raw: colA });
      continue;
    }

    const costMaterials = parseMoney(row[1]);
    const costWorkCollector = parseMoney(row[2]);
    const costWorkFrame = parseMoney(row[3]);
    const costWorkRouting = parseMoney(row[4]);
    const priceTotal = parseMoney(row[5]);

    if (
      costMaterials == null ||
      costWorkCollector == null ||
      costWorkFrame == null ||
      costWorkRouting == null ||
      priceTotal == null
    ) {
      rejected.push({
        line: i + 1,
        reason: 'не разобрана одна из цен',
        raw: JSON.stringify(row),
      });
      continue;
    }

    collectors.push({
      config,
      material,
      costMaterials,
      costWorkCollector,
      costWorkFrame,
      costWorkRouting,
      priceTotal,
    });
  }

  const st = await stat(filePath);
  return {
    collectors,
    jockeyKits,
    jockeyRouting,
    sourceFile: basename(filePath),
    priceDate: st.mtime,
    rejected,
  };
}
