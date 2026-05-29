'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card } from '@/components/ui';
import type { Meta, StationInput } from '@/lib/dossier/types';
import { CardSummary } from '@/components/system/CardSummary';
import { KimiCalcPanel } from '@/components/calc/KimiCalcPanel';
import { approveSystem, unapproveSystem } from '@/server/actions/approve';
import type { KimiCalcData } from '@/server/actions/kimi-calc';
import wiz from '@/components/wizard/Wizard.module.css';

const STEPS = [
  { key: 'input', title: 'Вход', hint: 'Карточка параметров из ТЗ — что распознал Kimi, инженер правит.' },
  { key: 'calc', title: 'Расчёт', hint: 'Kimi считает станцию по методике скила pump-station-calc.' },
  { key: 'approve', title: 'Утверждение', hint: 'Фиксация расчёта в снапшот — из него формируется ТКП.' },
] as const;

function stepForStatus(status: string): number {
  if (status === 'INPUT') return 0;
  if (status === 'FINALIZED') return 2;
  return 1;
}

export interface SystemFlowProps {
  systemId: string;
  projectId: string;
  status: string;
  initialMeta: Meta;
  initialInput: StationInput;
  initialCalc?: KimiCalcData;
  approvedAt?: string | null;
}

export function SystemFlow({
  systemId,
  projectId,
  status,
  initialMeta,
  initialInput,
  initialCalc,
  approvedAt,
}: SystemFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(stepForStatus(status));
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reached = stepForStatus(status);
  const isFinalized = status === 'FINALIZED';

  function approve() {
    setError(null);
    startBusy(async () => {
      const r = await approveSystem(systemId);
      if (r.ok) {
        router.refresh();
        setStep(2);
      } else setError(r.error ?? 'Ошибка утверждения');
    });
  }

  function reopen() {
    setError(null);
    startBusy(async () => {
      await unapproveSystem(systemId);
      router.refresh();
      setStep(1);
    });
  }

  const cur = STEPS[step];

  return (
    <div className={wiz.layout}>
      {/* Рейл шагов — номер + название (компактно, как в визарде) */}
      <nav className={wiz.steps}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx(
              wiz.stepBtn,
              i === step && wiz.stepActive,
              i < reached && wiz.stepDone,
            )}
            onClick={() => setStep(i)}
          >
            <span className={wiz.stepNum}>{i < reached ? '✓' : i + 1}</span>
            {s.title}
          </button>
        ))}
      </nav>

      <Card>
        <div className={wiz.stepTitle}>{cur.title}</div>
        <div className={wiz.stepHint}>{cur.hint}</div>

        {error && <div className={wiz.errorBox}>{error}</div>}

        {/* Шаг 1 — Вход (компактная карточка из ТЗ) */}
        {step === 0 && (
          <CardSummary
            systemId={systemId}
            meta={initialMeta}
            input={initialInput}
            onNext={() => setStep(1)}
          />
        )}

        {/* Шаг 2 — Расчёт через Kimi */}
        {step === 1 && (
          <>
            <KimiCalcPanel systemId={systemId} initialData={initialCalc} />
            <div className={wiz.actions} style={{ marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setStep(0)}>
                ← К карточке
              </Button>
              <Button
                onClick={approve}
                disabled={busy || !initialCalc}
                title={!initialCalc ? 'Сначала выполните расчёт' : undefined}
              >
                {busy ? 'Утверждаю…' : 'Утвердить расчёт →'}
              </Button>
            </div>
          </>
        )}

        {/* Шаг 3 — Утверждение */}
        {step === 2 && (
          <>
            {isFinalized ? (
              <>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    fontSize: 14,
                    marginBottom: 16,
                  }}
                >
                  Расчёт <b>утверждён</b>
                  {approvedAt ? ` ${new Date(approvedAt).toLocaleString('ru-RU')}` : ''}.
                  Данные заморожены — ТКП формируется из этого снапшота.
                </div>
                {initialCalc?.items?.length ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 16 }}>
                    <tbody>
                      {initialCalc.items.map((it, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', fontWeight: 500, width: '30%' }}>{it.param}</td>
                          <td style={{ padding: '8px', width: '28%' }}>{it.value}</td>
                          <td style={{ padding: '8px', color: 'var(--muted)' }}>{it.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {initialCalc?.code && (
                  <div style={{ fontSize: 14, marginBottom: 16 }}>
                    <span style={{ color: 'var(--muted)' }}>Шифр: </span>
                    <code style={{ fontWeight: 600 }}>{initialCalc.code}</code>
                  </div>
                )}
                <div className={wiz.actions}>
                  <Button variant="ghost" onClick={reopen} disabled={busy}>
                    {busy ? '…' : 'Снять утверждение'}
                  </Button>
                  <Button onClick={() => router.push(`/projects/${projectId}/proposal`)}>
                    Сформировать ТКП →
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, marginTop: 0, color: 'var(--muted)' }}>
                  Расчёт ещё не утверждён. Вернитесь к шагу «Расчёт», выполните
                  расчёт через Kimi и нажмите «Утвердить расчёт».
                </p>
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← К расчёту
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
