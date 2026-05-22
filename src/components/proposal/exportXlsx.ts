import * as XLSX from 'xlsx';
import { compute } from '@/lib/calc';
import { formatRub } from '@/lib/format';
import type { Project, Client } from '@/lib/types';
import type { StandardCard, SystemTypeKey } from '@/lib/standards';

type Row = (string | number)[];

export function exportProposalXlsx(project: Project, client?: Client, standards: StandardCard[] = []) {
  const rows: Row[] = [];
  // Шапка
  rows.push([`ТКП №${project.id.replace('proj-', '')} от ${new Date().toLocaleDateString('ru-RU')}`]);
  rows.push([`Объект: ${project.object.name}`]);
  rows.push([`Заказчик: ${client?.shortName ?? '—'} (ИНН ${client?.inn ?? '—'})`]);
  rows.push([]);
  rows.push(['№', 'Артикул', 'Наименование', 'Комментарий', 'Цена, ₽', 'Кол-во', 'Стоимость, ₽', 'Скидка, %', 'Закупка, ₽']);

  let grandTotal = 0;
  let pos = 1;

  for (const sys of project.systems) {
    const r = sys.bom ? { bom: sys.bom, totalCost: sys.totalCost ?? 0 } : compute(sys);
    rows.push([`Система: ${sys.name}`]);
    for (const b of r.bom) {
      rows.push([
        pos++,
        b.article ?? '',
        b.name,
        b.comment ?? '',
        b.unitPrice,
        b.quantity,
        b.amount,
        b.discountPct,
        b.purchaseCost,
      ]);
    }
    rows.push(['', '', `Итого по системе`, '', '', '', '', '', r.totalCost]);
    rows.push([]);
    grandTotal += r.totalCost;
  }

  rows.push([]);
  rows.push(['', '', 'ИТОГО ЗАКУПКА', '', '', '', '', '', grandTotal]);
  rows.push(['', '', `НДС ${project.terms.vatPct}%`, '', '', '', '', '', grandTotal * project.terms.vatPct / 100]);
  rows.push(['', '', 'ВСЕГО К ОПЛАТЕ', '', '', '', '', '', grandTotal * (1 + project.terms.vatPct / 100)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ширина колонок
  ws['!cols'] = [
    { wch: 5 }, { wch: 20 }, { wch: 50 }, { wch: 30 },
    { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ТКП');

  // Лист «Нормативы» — что использовано при расчёте
  if (standards.length > 0) {
    const types = new Set<SystemTypeKey>(project.systems.map((s) => s.type as SystemTypeKey));
    const filtered = standards
      .filter((s) => s.status !== 'cancelled')
      .filter((s) => s.appliesTo.some((t) => types.has(t)));

    if (filtered.length > 0) {
      const stdRows: Row[] = [];
      stdRows.push(['Расчёт выполнен в соответствии с']);
      stdRows.push([]);
      stdRows.push(['Код', 'Название', 'Область применения', 'Статус', 'Источник']);
      for (const s of filtered) {
        stdRows.push([
          s.code,
          s.title,
          s.scope,
          s.status === 'active' ? 'Действует' : s.status === 'recommended' ? 'Рекомендуется' : 'Отменён',
          s.sourceUrl ?? '',
        ]);
      }
      const stdWs = XLSX.utils.aoa_to_sheet(stdRows);
      stdWs['!cols'] = [{ wch: 22 }, { wch: 50 }, { wch: 50 }, { wch: 14 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, stdWs, 'Нормативы');
    }
  }

  XLSX.writeFile(wb, `ТКП_${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
