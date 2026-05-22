import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Table.module.css';

export type TableColumn<Row> = {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string | number;
  render: (row: Row) => ReactNode;
};

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  compact?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function Table<Row>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  compact,
  emptyState,
  className,
}: TableProps<Row>) {
  return (
    <div className={clsx(styles.tableWrap, className)}>
      <table className={clsx(styles.table, compact && styles.compact, onRowClick && styles.clickable)}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(c.align === 'right' && styles.alignRight, c.align === 'center' && styles.alignCenter)}
                style={{ width: c.width }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyState ?? 'Нет данных'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx(c.align === 'right' && styles.alignRight, c.align === 'center' && styles.alignCenter)}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
