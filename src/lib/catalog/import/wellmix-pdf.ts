/**
 * Адаптер импорта прайса Wellmix — PDF (Фаза 3).
 *
 * PDF разбирается системным `pdftotext -layout`, далее regex по строкам.
 * Прайс-строка имеет вид:
 *   `<8-значный артикул>  <наименование>  <цена в рублях>`
 * Цена — целое число рублей с пробелами-разделителями тысяч (напр. `1 749`).
 *
 * Строки без наименования (перенос таблицы — артикул и цена без названия)
 * пропускаются: без наименования позиция не идентифицируется.
 *
 * Серия определяется по наименованию: токен после слова «Wellmix»
 * (WRS, WRE, CUC, CMI, CV, NBW…). Если «Wellmix» не найдено — первый
 * латинский токен наименования.
 */
import { execFileSync } from 'node:child_process';
import type { ImportMeta, ImportPriceRow, ImportReject, ImportResult } from './types';

const MANUFACTURER = 'Wellmix';
const CURRENCY = 'RUB' as const;
const PRICE_DATE = '2026-01-01';
const TITLE = 'Wellmix прайс 2026';

/**
 * Прайс-строка: 8 цифр артикула, наименование, цена (цифры с пробелами).
 * Группы: 1 — sku, 2 — наименование, 3 — цена.
 */
const ROW_RE = /^\s*(\d{8})\s+(.+?)\s{2,}(\d[\d\s]*\d|\d)\s*$/;

/** Строка без наименования: только артикул и цена (перенос таблицы). */
const ROW_NO_NAME_RE = /^\s*(\d{8})\s+(\d[\d\s]*\d|\d)\s*$/;

/** Извлекает текст из PDF через системный `pdftotext -layout`. */
export function extractPdfText(pdfPath: string): string {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Определяет серию по наименованию позиции Wellmix.
 * @returns токен серии либо undefined, если не распознан.
 */
export function extractSeries(name: string): string | undefined {
  const afterBrand = name.match(/Wellmix\s+([A-Z][A-Z0-9]*)/i);
  if (afterBrand) return afterBrand[1].toUpperCase();
  const firstLatin = name.match(/\b([A-Z]{2,}[A-Z0-9]*)\b/);
  return firstLatin ? firstLatin[1].toUpperCase() : undefined;
}

/**
 * Разбирает текст прайса Wellmix (вывод `pdftotext -layout`) → строки.
 * @param text   текст, извлечённый из PDF.
 * @param file   имя/путь исходного PDF (для метаданных).
 */
export function parseWellmixText(text: string, file = 'wellmix.pdf'): ImportResult {
  const lines = text.split(/\r?\n/);
  const rows: ImportPriceRow[] = [];
  const rejected: ImportReject[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, i) => {
    const line = i + 1;

    const noName = raw.match(ROW_NO_NAME_RE);
    if (noName) {
      rejected.push({ line, reason: 'строка без наименования (перенос таблицы)', raw: raw.trim() });
      return;
    }

    const m = raw.match(ROW_RE);
    if (!m) return; // не прайс-строка — заголовок/описание

    const sku = m[1];
    const name = m[2].trim().replace(/\s{2,}/g, ' ');
    const price = Number(m[3].replace(/\s/g, ''));

    if (!Number.isFinite(price) || price <= 0) {
      rejected.push({ line, reason: `некорректная цена «${m[3]}»`, raw: raw.trim() });
      return;
    }
    if (!name) {
      rejected.push({ line, reason: 'пустое наименование', raw: raw.trim() });
      return;
    }
    if (seen.has(sku)) {
      rejected.push({ line, reason: 'дубликат артикула', raw: raw.trim() });
      return;
    }

    const series = extractSeries(name);
    if (!series) {
      rejected.push({ line, reason: 'не удалось определить серию', raw: raw.trim() });
      return;
    }

    seen.add(sku);
    rows.push({ sku, name, series, price, currency: CURRENCY });
  });

  const meta: ImportMeta = {
    manufacturer: MANUFACTURER,
    title: TITLE,
    sourceFile: file,
    currency: CURRENCY,
    priceDate: PRICE_DATE,
  };

  return { rows, meta, rejected };
}

/**
 * Адаптер импорта Wellmix: извлекает текст из PDF и разбирает его.
 * @param pdfPath путь к PDF-файлу прайса.
 * @param file    имя файла для метаданных (по умолчанию — basename pdfPath).
 */
export function importWellmixPdf(pdfPath: string, file?: string): ImportResult {
  const text = extractPdfText(pdfPath);
  return parseWellmixText(text, file ?? pdfPath);
}
