'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { calcSystemViaKimi } from '@/server/actions/kimi-calc';

/**
 * Панель расчёта системы через Kimi-агента. Показывает что посчитано
 * (с обоснованием и гейтами) прямо на экране. Кеш отдаётся мгновенно,
 * пересчёт гоняет агента (~3 мин).
 */
export function KimiCalcPanel({
  systemId,
  initialOutput,
}: {
  systemId: string;
  initialOutput?: string;
}) {
  const [output, setOutput] = useState(initialOutput ?? '');
  const [cached, setCached] = useState(Boolean(initialOutput));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(force: boolean) {
    setLoading(true);
    setError(null);
    const r = await calcSystemViaKimi(systemId, force);
    setLoading(false);
    if (r.ok) {
      setOutput(r.output ?? '');
      setCached(Boolean(r.cached));
    } else {
      setError(r.error ?? 'Ошибка расчёта');
    }
  }

  return (
    <Card title="Расчёт через Kimi (по методике скила pump-station-calc)">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <Button onClick={() => run(false)} disabled={loading}>
          {loading
            ? 'Kimi считает по методике (~3 мин)…'
            : output
              ? 'Пересчитать'
              : 'Рассчитать через Kimi'}
        </Button>
        {cached && !loading && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>результат из кеша</span>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {output && (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 14,
            maxHeight: 600,
            overflow: 'auto',
          }}
        >
          {output}
        </div>
      )}

      {!output && !loading && !error && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Kimi прочитает карточку выше, применит методику расчёта насосной
          станции (5 шагов: расчёт → подбор → ценообразование) и покажет
          решение с обоснованием и списком вопросов на проверку инженеру.
        </p>
      )}
    </Card>
  );
}
