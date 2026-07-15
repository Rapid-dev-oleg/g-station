import Link from 'next/link';
import { Card, Badge, Table, EmptyState } from '@/components/ui';
import type { TypeNormRow } from '@/server/actions/norms';

/**
 * Нормативы типа = нормы, на которые ссылаются его инструкции (токены
 * {{norm:код}}). Управление самими нормами (текст/якоря/версии) — в библиотеке
 * /admin/norms; здесь видно, что тип использует и нет ли битых ссылок.
 */
export function TypeNormsTab({ norms }: { norms: TypeNormRow[] }) {
  const broken = norms.filter((n) => !n.inLibrary);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted,#667)' }}>
        Нормы, на которые ссылаются инструкции этого типа. Текст/якоря/версии норм ведутся в{' '}
        <Link href="/admin/norms" style={{ color: 'var(--hydro,#1668a8)' }}>библиотеке норм</Link>.
      </p>

      {broken.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>
          Битые ссылки: {broken.map((b) => b.code).join(', ')} — таких норм нет в библиотеке. Добавьте их или поправьте токен в инструкции.
        </div>
      )}

      <Card title="Используемые нормы" subtitle="Из токенов инструкций типа">
        <Table
          columns={[
            { key: 'code', header: 'Код', render: (n: TypeNormRow) => (
                <strong style={{ fontFamily: 'var(--font-mono,monospace)' }}>{n.code}</strong>
              ) },
            { key: 'title', header: 'Название', render: (n) => n.inLibrary
                ? (n.title ?? '—')
                : <span style={{ color: '#c33' }}>нет в библиотеке</span> },
            { key: 'cat', header: 'Категория', render: (n) => n.category ? <Badge variant="info">{n.category}</Badge> : '—' },
            { key: 'anchors', header: 'Якоря', align: 'right', render: (n) => n.anchors || '—' },
            { key: 'refs', header: 'Ссылок', align: 'right', render: (n) => n.refs },
            { key: 'status', header: 'Статус', render: (n) => !n.inLibrary
                ? <Badge variant="danger" withDot>битая</Badge>
                : n.status === 'active'
                  ? <Badge variant="success" withDot>активна</Badge>
                  : <Badge variant="default" withDot>{n.status}</Badge> },
          ]}
          rows={norms}
          getRowKey={(n) => n.code}
          emptyState={<EmptyState title="Нет ссылок на нормы"
            description="Инструкции этого типа пока не ссылаются на нормы токеном {{norm:код}}." />}
        />
      </Card>
    </div>
  );
}
