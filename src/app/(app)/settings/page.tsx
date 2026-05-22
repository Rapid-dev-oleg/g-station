import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui';
import { getSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

const ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 14,
};
const LABEL: React.CSSProperties = { color: 'var(--muted)' };
const VALUE: React.CSSProperties = { fontWeight: 600 };

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Настройки"
        subtitle="Реквизиты компании и параметры расчёта по умолчанию"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <Card title="Реквизиты компании">
          <div style={ROW}>
            <span style={LABEL}>Наименование</span>
            <span style={VALUE}>{settings?.companyName ?? '—'}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>ИНН</span>
            <span style={VALUE}>{settings?.companyInn ?? '—'}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Адрес</span>
            <span style={VALUE}>{settings?.companyAddress ?? '—'}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Телефон</span>
            <span style={VALUE}>{settings?.companyPhone ?? '—'}</span>
          </div>
          <div style={{ ...ROW, borderBottom: 'none' }}>
            <span style={LABEL}>Email</span>
            <span style={VALUE}>{settings?.companyEmail ?? '—'}</span>
          </div>
        </Card>

        <Card title="Параметры расчёта по умолчанию">
          <div style={ROW}>
            <span style={LABEL}>Курс USD</span>
            <span style={VALUE}>{settings?.defaultRateUsd ?? '—'}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Курс CNY</span>
            <span style={VALUE}>{settings?.defaultRateCny ?? '—'}</span>
          </div>
          <div style={{ ...ROW, borderBottom: 'none' }}>
            <span style={LABEL}>Коэффициент наценки</span>
            <span style={VALUE}>{settings?.defaultMarkup ?? '—'}</span>
          </div>
        </Card>
      </div>

      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
        Редактирование настроек выполняется администратором базы данных.
      </p>
    </>
  );
}
