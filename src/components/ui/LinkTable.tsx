import Link from 'next/link';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { TableColumn } from './Table';
import styles from './Table.module.css';

/**
 * Таблица с навигацией по строкам — Server Component.
 * Каждая ячейка оборачивается в <Link> (клиентский JS не нужен),
 * поэтому колонки с функциями render можно задавать прямо в Server Components.
 */
export interface LinkTableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  getRowHref: (row: Row) => string;
  compact?: boolean;
  emptyState?: ReactNode;
}

const cellLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 14px',
  color: 'inherit',
  textDecoration: 'none',
};

export function LinkTable<Row>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  compact,
  emptyState,
}: LinkTableProps<Row>) {
  return (
    <div className={styles.tableWrap}>
      <table className={clsx(styles.table, compact && styles.compact, styles.clickable)}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  c.align === 'right' && styles.alignRight,
                  c.align === 'center' && styles.alignCenter,
                )}
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
            rows.map((row) => {
              const href = getRowHref(row);
              return (
                <tr key={getRowKey(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={clsx(
                        c.align === 'right' && styles.alignRight,
                        c.align === 'center' && styles.alignCenter,
                      )}
                      style={{ padding: 0 }}
                    >
                      <Link href={href} style={{ ...cellLinkStyle, textAlign: c.align ?? 'left' }}>
                        {c.render(row)}
                      </Link>
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
