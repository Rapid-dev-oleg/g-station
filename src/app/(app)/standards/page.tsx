import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Card, EmptyState, IconBook, Table } from '@/components/ui';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type NormRow = {
  id: string;
  code: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
};

export default async function StandardsPage() {
  const norms: NormRow[] = await db.norm.findMany({
    orderBy: { code: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Нормы"
        subtitle="Справочник нормативов (СП, ГОСТ), применяемых при расчёте ПНС"
      />

      {norms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBook />}
            title="Нормативы не загружены"
            description="Справочник наполняется через сид базы данных"
          />
        </Card>
      ) : (
        <Card title="Нормативные документы" subtitle={`${norms.length} документов`}>
          <Table<NormRow>
            getRowKey={(n) => n.id}
            rows={norms}
            columns={[
              {
                key: 'code',
                header: 'Шифр',
                width: 160,
                render: (n) =>
                  n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.code}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{n.code}</span>
                  ),
              },
              {
                key: 'title',
                header: 'Наименование',
                render: (n) => (
                  <div>
                    <div>{n.title}</div>
                    {n.summary && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {n.summary}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'category',
                header: 'Категория',
                render: (n) => <Badge variant="info">{n.category}</Badge>,
              },
            ]}
          />
        </Card>
      )}
    </>
  );
}
