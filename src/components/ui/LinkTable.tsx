'use client';

import { useRouter } from 'next/navigation';
import { Table, type TableColumn } from './Table';

/**
 * Обёртка над Table для Server Components: клик по строке ведёт на href.
 * Колонки задаются на сервере, навигация — на клиенте.
 */
export interface LinkTableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  getRowHref: (row: Row) => string;
  compact?: boolean;
  emptyState?: React.ReactNode;
}

export function LinkTable<Row>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  compact,
  emptyState,
}: LinkTableProps<Row>) {
  const router = useRouter();
  return (
    <Table
      columns={columns}
      rows={rows}
      getRowKey={getRowKey}
      compact={compact}
      emptyState={emptyState}
      onRowClick={(row) => router.push(getRowHref(row))}
    />
  );
}
