'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { updatePricingSettings } from '@/server/actions/settings';

/**
 * Форма редактирования параметров ценообразования: курс USD, наценка клиенту.
 * Параметры используются в `getPricingSettings()` → kimi-calc собирает смету.
 */
export function PricingSettings({
  initialRateUsd,
  initialMarkup,
}: {
  initialRateUsd: number | null;
  initialMarkup: number | null;
}) {
  const [rateUsd, setRateUsd] = useState(initialRateUsd?.toString() ?? '');
  const [markup, setMarkup] = useState(initialMarkup?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await updatePricingSettings({
        defaultRateUsd: rateUsd ? Number(rateUsd) : null,
        defaultMarkup: markup ? Number(markup) : null,
      });
      if (r.ok) setSavedAt(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Row label="Курс USD → RUB" hint="Используется для конверсии прайса CNP (в БД он в USD)">
        <input
          type="number"
          step="0.01"
          value={rateUsd}
          onChange={(e) => setRateUsd(e.target.value)}
          placeholder="92"
          style={INPUT}
        />
      </Row>
      <Row label="Коэф. наценки клиенту" hint="Себестоимость × этот коэф. = цена клиенту">
        <input
          type="number"
          step="0.01"
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
          placeholder="1.7"
          style={INPUT}
        />
      </Row>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </Button>
        {savedAt && (
          <span style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>
            сохранено {savedAt}
          </span>
        )}
        {error && (
          <span style={{ fontSize: 13, color: '#b91c1c' }}>{error}</span>
        )}
      </div>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 14,
  width: 120,
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
