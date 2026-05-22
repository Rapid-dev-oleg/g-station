/**
 * Экспорт ТКП в XLSX. Адаптировано из прототипа rusgidrostroy —
 * данные перевязаны на расчётные дела (Dossier) систем проекта.
 *
 * Лист «ТКП» — спецификация/смета по системам с итогами.
 * Лист «Нормативы» — applicable_norms из расчётных дел.
 */

import * as XLSX from 'xlsx';
import type { ProposalData } from './proposalData';

type Cell = string | number;
type Row = Cell[];

/** Реквизиты для шапки выгрузки. */
export interface ExportMeta {
  proposalId: string;
  date: string;
  objectName: string;
  clientName: string;
  clientInn?: string;
  companyName: string;
}

/**
 * Формирует и скачивает XLSX из модели ТКП.
 * Вызывается в client-компоненте по клику.
 */
export function exportProposalXlsx(
  data: ProposalData,
  meta: ExportMeta,
  norms: string[] = [],
): void {
  const rows: Row[] = [];

  // ── Шапка ──────────────────────────────────────────────────────────────
  rows.push([`Технико-коммерческое предложение № ${meta.proposalId}`]);
  rows.push([`от ${meta.date}`]);
  rows.push([`Поставщик: ${meta.companyName}`]);
  rows.push([`Объект: ${meta.objectName}`]);
  rows.push([
    `Заказчик: ${meta.clientName}${
      meta.clientInn ? ` (ИНН ${meta.clientInn})` : ''
    }`,
  ]);
  rows.push([]);
  rows.push([
    '№',
    'Наименование',
    'Группа',
    'Цена',
    'Валюта',
    'Кол-во',
    'Скидка, %',
    'Закупка, ₽',
  ]);

  // ── Системы ────────────────────────────────────────────────────────────
  for (const sys of data.systems) {
    const head = sys.productCode
      ? `Система: ${sys.name} — ${sys.productCode}`
      : `Система: ${sys.name}`;
    rows.push([head]);
    const spec = [
      sys.Q != null ? `Q=${sys.Q} м³/ч` : null,
      sys.H != null ? `H=${sys.H} м` : null,
      sys.power != null ? `P=${sys.power} кВт` : null,
      sys.scheme ? `схема ${sys.scheme}` : null,
      sys.pumpBrand ? `насос ${sys.pumpBrand}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (spec) rows.push([spec]);

    if (sys.pricingMissing) {
      rows.push(['', 'Расчёт не доведён до ценообразования']);
    } else {
      for (const r of sys.rows) {
        rows.push([
          r.position,
          r.name,
          r.group ?? '',
          r.unitPrice,
          r.currency,
          r.qty,
          r.discount,
          Math.round(r.cost),
        ]);
      }
    }
    rows.push(['', 'Итого по системе', '', '', '', '', '', Math.round(sys.total)]);
    rows.push([]);
  }

  // ── Итоги ──────────────────────────────────────────────────────────────
  rows.push([]);
  rows.push([
    '',
    'ИТОГО ЗАКУПКА ПО ВСЕМ СИСТЕМАМ',
    '',
    '',
    '',
    '',
    '',
    Math.round(data.grandCost),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 52 },
    { wch: 14 },
    { wch: 12 },
    { wch: 9 },
    { wch: 9 },
    { wch: 11 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ТКП');

  // ── Лист «Нормативы» ───────────────────────────────────────────────────
  if (norms.length > 0) {
    const stdRows: Row[] = [];
    stdRows.push(['Расчёт выполнен в соответствии с нормативами']);
    stdRows.push([]);
    stdRows.push(['№', 'Норматив']);
    norms.forEach((n, i) => stdRows.push([i + 1, n]));
    const stdWs = XLSX.utils.aoa_to_sheet(stdRows);
    stdWs['!cols'] = [{ wch: 5 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, stdWs, 'Нормативы');
  }

  const safeObject = meta.objectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  XLSX.writeFile(
    wb,
    `ТКП_${safeObject}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
