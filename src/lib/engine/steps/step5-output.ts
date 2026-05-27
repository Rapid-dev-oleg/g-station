/**
 * Шаг 5 — Выход (на уровне станции).
 *
 * Шифр изделия (делегируется модулю типа), выбор итогового варианта,
 * validation_flags по чек-листу.
 */

import type {
  Output,
  Station,
  ValidationFlag,
} from '@/lib/dossier/types';
import { fireModule } from '../types/fire';

/** Допустимые значения output.documents по схеме дела. */
type DocumentFile =
  | 'ТП-pdf'
  | 'ТКП-pdf'
  | 'смета-xlsx'
  | 'гидросхема'
  | 'габаритный-чертёж'
  | 'чертёж-DWG'
  | 'техлист-насоса';

/** Список выпускаемых файлов документации по формату выхода кейса. */
function outputDocuments(station: Station, outputFormat?: string): DocumentFile[] {
  const docs: DocumentFile[] = [];
  const wantsTp = !outputFormat || outputFormat.includes('ТП');
  if (wantsTp) {
    docs.push('ТП-pdf', 'гидросхема', 'габаритный-чертёж', 'техлист-насоса');
  } else if (outputFormat?.includes('ТКП')) {
    docs.push('ТКП-pdf');
  }
  // смета — почти всегда
  if (!outputFormat || /смета|ТП|ТКП/.test(outputFormat)) docs.push('смета-xlsx');
  if (outputFormat?.includes('DWG')) docs.push('чертёж-DWG');
  void station;
  return docs;
}

/** Собирает строку шифра из сегментов. */
function buildProductCode(seg: NonNullable<Output['code_segments']>, pumpModel?: string): string {
  const parts: string[] = [];
  parts.push(`G-Fire ${seg.series ?? 'GF'}`);
  parts.push(seg.purpose_letter ?? 'П');
  parts.push(seg.scheme ?? '1/1');
  // марка насоса — если выбрана инженером; иначе плейсхолдер
  parts.push(pumpModel ?? '<марка-насоса>');
  parts.push(seg.regulation ?? 'ПП');
  return [parts.join('-'), ...(seg.options ?? [])].join('-');
}

/**
 * Валидация дела по чек-листу шага 5.
 * Возвращает флаги проблем.
 */
function validateStation(station: Station): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  for (const variant of station.variants ?? []) {
    const pricing = variant.pricing;
    if (!pricing) continue;

    // позиция с ценой 0 (особенно ШУ)
    for (const row of pricing.rows ?? []) {
      if (row.price === 0) {
        if (row.position_group === 'автоматика') {
          if (!flags.includes('ШУ-цена-0')) flags.push('ШУ-цена-0');
        } else if (!flags.includes('позиция-выпала-из-ИТОГО')) {
          flags.push('позиция-выпала-из-ИТОГО');
        }
      }
    }

    // формула ИТОГО суммирует все строки
    const sum =
      Math.round((pricing.rows ?? []).reduce((s, r) => s + (r.purchase_cost ?? 0), 0) * 100) / 100;
    if (pricing.total_cost != null && Math.abs(sum - pricing.total_cost) > 1) {
      if (!flags.includes('позиция-выпала-из-ИТОГО')) flags.push('позиция-выпала-из-ИТОГО');
    }

    // курс валюты задан
    const needsRate = (pricing.rows ?? []).some((r) => r.currency && r.currency !== 'RUB');
    if (needsRate && pricing.exchange_rate == null) {
      if (!flags.includes('курс-REF')) flags.push('курс-REF');
    }

    // наценка проставлена
    if (pricing.markup_coefficient == null) {
      if (!flags.includes('наценка-не-проставлена')) flags.push('наценка-не-проставлена');
    }
  }

  return flags;
}

/**
 * Шаг 5 для одной станции. Заполняет `station.output`.
 * Мутирует переданный (клонированный) объект.
 */
export function processStation5(
  station: Station,
  outputFormat?: string,
): void {
  const output: Output = { ...(station.output ?? {}) };
  const variants = station.variants ?? [];

  // 5.2. Выбор итогового варианта — минимальная цена среди вариантов.
  if (variants.length > 0) {
    let bestIdx = 0;
    let bestPrice = Infinity;
    for (const [i, v] of variants.entries()) {
      const price = v.pricing?.client_price ?? v.pricing?.total_cost ?? Infinity;
      if (price < bestPrice) {
        bestPrice = price;
        bestIdx = i;
      }
    }
    output.selected_variant = bestIdx;
    output.selection_criterion = 'минимальная-цена';

    // 5.1. Шифр изделия — по выбранному варианту.
    const selected = variants[bestIdx];
    const segments = fireModule.codeSegments(station, selected);
    output.code_segments = segments;
    output.product_code = buildProductCode(segments, selected.equipment?.main_pump?.model);
  }

  // 5.3. Выпускаемые файлы документации (по формату выхода кейса).
  output.documents = outputDocuments(station, outputFormat);

  // 5.4. Валидация.
  output.validation_flags = validateStation(station);

  station.output = output;
}
