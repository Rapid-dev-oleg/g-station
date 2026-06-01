'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import { saveCalcEdits, type BomLine, type CalcItem, type KimiCalcData } from '@/server/actions/kimi-calc';
import { enqueueCalc, getJob, getJobForSystem } from '@/server/actions/jobs';

const rub = (n?: number) =>
  n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

const TIER_LABEL: Record<NonNullable<BomLine['tier']>, string> = {
  optimum: 'оптимум',
  reserve: 'с запасом',
  economy: 'эконом',
};

/** Строка сметы с переключателем вариантов (если есть alternatives). */
function BomRow({ line, onChoose }: { line: BomLine; onChoose: (b: BomLine) => void }) {
  const [open, setOpen] = useState(false);
  const hasAlt = (line.alternatives?.length ?? 0) > 0;
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border)' }}>
        <td style={{ padding: '8px' }}>
          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {line.name}
            {line.source && <SourceBadge source={line.source} url={line.sourceUrl} />}
            {line.tier && (
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  background: '#f1f5f9',
                  color: '#475569',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                {TIER_LABEL[line.tier]}
              </span>
            )}
            {hasAlt && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                  fontSize: 11,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  padding: '1px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                {open ? 'скрыть' : `варианты (${line.alternatives!.length})`}
              </button>
            )}
          </div>
          {(line.article || line.supplier || line.note) && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {[line.article, line.supplier, line.note].filter(Boolean).join(' · ')}
            </div>
          )}
        </td>
        <td style={{ padding: '8px' }}>{rub(line.priceRub)}</td>
        <td style={{ padding: '8px' }}>{line.qty ?? '—'}</td>
        <td style={{ padding: '8px', fontWeight: 500 }}>{rub(line.sum)}</td>
      </tr>
      {open &&
        line.alternatives!.map((alt, i) => (
          <tr key={`alt-${i}`} style={{ background: '#f8fafc', borderTop: '1px dashed var(--border)' }}>
            <td style={{ padding: '6px 8px 6px 24px' }}>
              <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {alt.name}
                {alt.source && <SourceBadge source={alt.source} url={alt.sourceUrl} />}
                {alt.tier && (
                  <span style={{ fontSize: 10, color: '#475569' }}>{TIER_LABEL[alt.tier]}</span>
                )}
                <button
                  type="button"
                  onClick={() => onChoose(alt)}
                  style={{
                    fontSize: 11,
                    border: 'none',
                    background: 'var(--brand, #0369a1)',
                    color: 'white',
                    padding: '2px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  выбрать
                </button>
              </div>
              {(alt.article || alt.supplier || alt.note) && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {[alt.article, alt.supplier, alt.note].filter(Boolean).join(' · ')}
                </div>
              )}
            </td>
            <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{rub(alt.priceRub)}</td>
            <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{alt.qty ?? '—'}</td>
            <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{rub(alt.sum)}</td>
          </tr>
        ))}
    </>
  );
}

/** Бейдж источника цены: БД (прайс компании) / веб (с URL) / оценка (по правилу). */
function SourceBadge({ source, url }: { source: 'db' | 'web' | 'estimate'; url?: string }) {
  const palette = {
    db: { bg: '#dcfce7', fg: '#166534', label: 'БД' },
    web: { bg: '#dbeafe', fg: '#1d4ed8', label: 'веб' },
    estimate: { bg: '#fef3c7', fg: '#92400e', label: 'оценка' },
  }[source];
  const badge = (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        background: palette.bg,
        color: palette.fg,
        padding: '1px 6px',
        borderRadius: 4,
        fontWeight: 600,
      }}
    >
      {palette.label}
    </span>
  );
  if (source === 'web' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        style={{ textDecoration: 'none' }}
      >
        {badge}
      </a>
    );
  }
  return badge;
}

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
  const [bom, setBom] = useState<BomLine[]>(initialData?.bom ?? []);
  const [total, setTotal] = useState<number | undefined>(initialData?.total);
  const [clientPrice, setClientPrice] = useState<number | undefined>(initialData?.clientPrice);
  const [code, setCode] = useState(initialData?.code ?? '');
  const [rawOutput, setRawOutput] = useState(initialData?.output ?? '');
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobMsg, setJobMsg] = useState<string | null>(null);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasResult = items.length > 0 || rawOutput;

  // Поллинг задачи расчёта: обновляет прогресс; по завершении — refresh страницы
  // (свежий результат подтянется из System.kimiCalc). Задача идёт на сервере,
  // поэтому переживает уход со страницы — на возврате поллинг возобновляется.
  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    setLoading(true);
    pollRef.current = setInterval(async () => {
      const j = await getJob(jobId);
      if (!j) return;
      setProgress(j.progress);
      setJobMsg(j.message);
      if (j.status === 'done') {
        stopPolling();
        setLoading(false);
        router.refresh();
      } else if (j.status === 'error') {
        stopPolling();
        setLoading(false);
        setError(j.error ?? 'Расчёт не удался');
      }
    }, 3000);
  }
  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  // На монтировании: если по системе уже идёт расчёт — возобновляем индикатор.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const j = await getJobForSystem(systemId);
      if (cancelled || !j) return;
      if (j.status === 'queued' || j.status === 'running') {
        setProgress(j.progress);
        setJobMsg(j.message);
        startPolling(j.id);
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId]);

  async function run(_force: boolean) {
    setError(null);
    setProgress(0);
    setJobMsg('Ставлю в очередь…');
    setLoading(true);
    const { jobId } = await enqueueCalc(systemId);
    startPolling(jobId);
  }

  function editValue(idx: number, value: string) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, value } : it)));
    setSavedAt(null);
  }

  /** Переключить вариант насоса (выбор из alternatives). Пересчитывает total/clientPrice. */
  function chooseAlternative(rowIdx: number, chosen: BomLine) {
    setBom((cur) => {
      const next = cur.slice();
      const old = next[rowIdx];
      const alts = [...(old.alternatives ?? []), { ...old, alternatives: undefined }].filter(
        (a) => (a.article ?? a.name) !== (chosen.article ?? chosen.name),
      );
      next[rowIdx] = { ...chosen, alternatives: alts };
      const t = next.reduce((s, b) => s + (b.sum ?? 0), 0);
      setTotal(t);
      setClientPrice(Math.round(t * 1.7));
      setSavedAt(null);
      return next;
    });
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
            ? `Считается… ${progress}%${jobMsg ? ' · ' + jobMsg : ''}`
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

          {/* Смета — позиции с ценами (подбор через веб-поиск) */}
          {bom.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 8 }}>
                Смета
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                    <th style={{ padding: '6px 8px' }}>Наименование / артикул</th>
                    <th style={{ padding: '6px 8px', width: '14%' }}>Цена</th>
                    <th style={{ padding: '6px 8px', width: '7%' }}>Кол-во</th>
                    <th style={{ padding: '6px 8px', width: '16%' }}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((b, i) => (
                    <BomRow key={i} line={b} onChoose={(chosen) => chooseAlternative(i, chosen)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '8px', color: 'var(--muted)' }} colSpan={3}>
                      Себестоимость
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{rub(total)}</td>
                  </tr>
                  {clientPrice != null && (
                    <tr>
                      <td style={{ padding: '8px', fontWeight: 600 }} colSpan={3}>
                        Цена клиенту (с наценкой)
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: 'var(--brand-dark, #0369a1)' }}>
                        {rub(clientPrice)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Источники цены: <SourceBadge source="db" /> — прайс компании в БД, <SourceBadge source="web" url="" /> — найдено в интернете (клик по бейджу → страница оборудования), <SourceBadge source="estimate" /> — оценка по правилу/методичке (прайса нет).
                Проверьте перед отправкой клиенту.
              </p>
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
