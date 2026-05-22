import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconArrowLeft,
  IconUpload,
  Table,
} from '@/components/ui';
import { getPriceLists } from '@/server/services/catalog';

export const dynamic = 'force-dynamic';

type PriceListRow = Awaited<ReturnType<typeof getPriceLists>>[number];

export default async function CatalogImportPage() {
  const priceLists = await getPriceLists();

  return (
    <>
      <PageHeader
        title="Импорт прайсов"
        subtitle="История загруженных прайс-листов производителей"
        actions={
          <Link href="/catalog" style={{ display: 'inline-flex' }}>
            <Button variant="ghost" leftIcon={<IconArrowLeft />}>
              К каталогу
            </Button>
          </Link>
        }
      />

      <Card
        title="Загрузка прайса"
        subtitle="Парсинг CNP CSV и Wellmix PDF выполняется CLI-скриптом"
        style={{ marginBottom: 16 }}
      >
        <EmptyState
          icon={<IconUpload />}
          title="UI-импорт в разработке"
          description="Пока прайсы загружаются командой npm run import:price. Здесь — история импорта."
        />
      </Card>

      <Card title="История импорта" subtitle={`${priceLists.length} записей`}>
        {priceLists.length === 0 ? (
          <EmptyState title="Прайсы ещё не импортировались" />
        ) : (
          <Table<PriceListRow>
            getRowKey={(p) => p.id}
            rows={priceLists}
            columns={[
              {
                key: 'title',
                header: 'Прайс',
                render: (p) => p.title,
              },
              {
                key: 'mfr',
                header: 'Производитель',
                render: (p) => (
                  <Badge variant="info">{p.manufacturer.name}</Badge>
                ),
              },
              {
                key: 'currency',
                header: 'Валюта',
                align: 'center',
                render: (p) => p.currency,
              },
              {
                key: 'rows',
                header: 'Позиций',
                align: 'center',
                render: (p) => p.rowCount,
              },
              {
                key: 'date',
                header: 'Импортирован',
                render: (p) =>
                  new Date(p.importedAt).toLocaleDateString('ru-RU'),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
