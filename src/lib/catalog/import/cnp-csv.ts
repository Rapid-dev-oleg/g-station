/**
 * Парсер CSV-прайса CNP (Фаза 3).
 *
 * Формат CSV: заголовок `серия,артикул,цена_USD`, далее строки прайса.
 * Каждая строка → `CatalogPump` (brand='CNP', currency='USD').
 *
 * Извлечение мощности `powerKw`: в артикулах CNP типа `NIS100-65-200/37SWH`
 * число после последнего `/` и перед буквенным суффиксом (`SWH`, `SWPC`,
 * `SWPR`, `SWHCJ` и т.п.) — мощность двигателя в кВт. Если паттерн не
 * распознан, `powerKw` остаётся undefined (мощность не выдумывается).
 */
import { parse } from 'csv-parse/sync';
import type { CatalogPump, PriceMeta } from '../types';

const BRAND = 'CNP';
const CURRENCY = 'USD' as const;
const PRICE_DATE = '2026-05-21';
const SOURCE = 'CNP прайс 2026-05-21';

/** Паттерн мощности: после `/`, число (возможно дробное), затем буквы. */
const POWER_RE = /\/(\d+(?:\.\d+)?)(SW[A-Z]*)$/i;

/**
 * Извлекает мощность двигателя из артикула CNP.
 * @returns кВт либо undefined, если паттерн не распознан.
 */
export function extractPowerKw(sku: string): number | undefined {
  const m = sku.match(POWER_RE);
  if (!m) return undefined;
  const kw = Number(m[1]);
  return Number.isFinite(kw) && kw > 0 ? kw : undefined;
}

export type CnpParseResult = {
  rows: CatalogPump[];
  meta: PriceMeta;
  /** Строки, отклонённые при парсинге (пустые/без цены). */
  rejected: { line: number; reason: string; raw: string[] }[];
};

/**
 * Разбирает содержимое CSV-прайса CNP.
 * @param content сырое содержимое CSV-файла.
 * @param file имя/путь исходного файла (для метаданных).
 */
export function parseCnpCsv(content: string, file = 'cnp-насосы.csv'): CnpParseResult {
  const records = parse(content, {
    columns: ['series', 'sku', 'priceUsd'],
    from_line: 2, // пропускаем строку заголовка
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: CatalogPump[] = [];
  const rejected: CnpParseResult['rejected'] = [];
  const seen = new Set<string>();

  records.forEach((rec, i) => {
    const line = i + 2;
    const series = (rec.series ?? '').trim();
    const sku = (rec.sku ?? '').trim();
    const priceRaw = (rec.priceUsd ?? '').trim().replace(/\s/g, '').replace(',', '.');
    const raw = [series, sku, priceRaw];

    if (!sku) {
      rejected.push({ line, reason: 'пустой артикул', raw });
      return;
    }
    if (!series) {
      rejected.push({ line, reason: 'пустая серия', raw });
      return;
    }
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price <= 0) {
      rejected.push({ line, reason: `некорректная цена «${priceRaw}»`, raw });
      return;
    }
    if (seen.has(sku)) {
      rejected.push({ line, reason: 'дубликат артикула', raw });
      return;
    }
    seen.add(sku);

    rows.push({
      sku,
      brand: BRAND,
      series,
      model: sku,
      priceUsd: price,
      currency: CURRENCY,
      powerKw: extractPowerKw(sku),
      priceDate: PRICE_DATE,
      source: SOURCE,
    });
  });

  const meta: PriceMeta = {
    source: SOURCE,
    file,
    date: PRICE_DATE,
    rowCount: rows.length,
    currency: CURRENCY,
  };

  return { rows, meta, rejected };
}
