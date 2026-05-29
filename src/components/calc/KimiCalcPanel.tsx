'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import {
  calcSystemViaKimi,
  saveCalcEdits,
  type CalcItem,
  type KimiCalcData,
} from '@/server/actions/kimi-calc';

/**
 * Расчёт системы через Kimi — структурой «пункт — значение — обоснование».
 * Значения редактируемы; строки-гейты (точная модель, бренд, наценка)
 * помечены и требуют решения инженера. Кеш отдаётся мгновенно.
 */
export function KimiCalcPanel({
  systemId,
  initialData,
}: {
  systemId: string;
  initialData?: KimiCalcData;
}) {
  const [items, setItems] = useState<CalcItem[]>(initialData?.items ?? []);
  const [code, setCode] = useState(initialData?.code ?? '');
  const [rawOutput, setRawOutput] = useState(initialData?.output ?? '');
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const hasResult = items.length > 0 || rawOutput;

  async function run(force: boolean) {
    setLoading(true);
    setError(null);
    const r = await calcSystemViaKimi(systemId, force);
    setLoading(false);
    if (r.ok && r.data) {
      setItems(r.data.items);
      setCode(r.data.code ?? '');
      setRawOutput(r.data.output);
    } else setError(r.error ?? 'Ошибка расчёта');
  }

  function editValue(idx: number, value: string) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, value } : it)));
    setSavedAt(null);
  }

  async function save() {
    const r = await saveCalcEdits(systemId, items);
    if (r.ok) setSavedAt(new Date().toLocaleTimeString('ru-RU'));
    else setError(r.error ?? 'Не удалось сохранить');
  }

  return (
    <Card title="Расчёт через Kimi (по методике скила)">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <Button onClick={() => run(false)} disabled={loading}>
          {loading
            ? 'Kimi считает по методике (~3 мин)…'
            : hasResult
              ? 'Пересчитать'
              : 'Рассчитать через Kimi'}
        </Button>
        {savedAt && (
          <span style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>
            правки сохранены {savedAt}
          </span>
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

      {items.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                <th style={{ padding: '6px 8px', width: '26%' }}>Параметр</th>
                <th style={{ padding: '6px 8px', width: '24%' }}>Значение</th>
                <th style={{ padding: '6px 8px' }}>Обоснование</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={i}
                  style={{
                    borderTop: '1px solid var(--border)',
                    background: it.gate ? '#fffbeb' : undefined,
                  }}
                >
                  <td style={{ padding: '8px', fontWeight: 500, verticalAlign: 'top' }}>
                    {it.param}
                    {it.gate && (
                      <span
                        style={{ fontSize: 11, color: '#b45309', display: 'block', fontWeight: 400 }}
                      >
                        на проверку инженеру
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <input
                      value={it.value}
                      onChange={(e) => editValue(i, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '5px 8px',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 14,
                        background: '#fff',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)', verticalAlign: 'top' }}>
                    {it.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {code && (
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Шифр изделия: </span>
              <code style={{ fontWeight: 600 }}>{code}</code>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
            <Button variant="secondary" onClick={save}>
              Сохранить правки
            </Button>
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--muted)',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showRaw ? 'скрыть' : 'показать'} подробный разбор Kimi
            </button>
          </div>
        </>
      )}

      {/* Сырой текст — только по запросу или когда структура не распарсилась */}
      {((showRaw && rawOutput) || (items.length === 0 && rawOutput)) && (
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
            maxHeight: 500,
            overflow: 'auto',
            marginTop: 12,
          }}
        >
          {rawOutput}
        </div>
      )}

      {!hasResult && !loading && !error && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Kimi применит методику расчёта (расчёт → подбор → ценообразование) и
          вернёт решение строками «параметр — значение — обоснование». Спорное
          (точная модель, бренд, наценка) пометит на проверку инженеру.
        </p>
      )}
    </Card>
  );
}
