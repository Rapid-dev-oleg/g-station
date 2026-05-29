'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card, Badge } from '@/components/ui';
import type { Meta, StationInput } from '@/lib/dossier/types';
import { SystemWizard } from '@/components/wizard/SystemWizard';
import { KimiCalcPanel } from '@/components/calc/KimiCalcPanel';
import { calcSystemViaKimi } from '@/server/actions/kimi-calc';
import { approveSystem, unapproveSystem } from '@/server/actions/approve';
import { SYSTEM_STATUS } from '@/lib/format/labels';
import wiz from '@/components/wizard/Wizard.module.css';

/** Шаги линейного потока системы. */
const STEPS = [
  { key: 'input', title: 'Вход', hint: 'карточка из ТЗ' },
  { key: 'calc', title: 'Расчёт', hint: 'Kimi по методике' },
  { key: 'approve', title: 'Утверждение', hint: 'снапшот для ТКП' },
] as const;

/** Шаг, на котором поток находится по статусу системы. */
function stepForStatus(status: string): number {
  if (status === 'INPUT') return 0;
  if (status === 'FINALIZED') return 2;
  return 1; // CALCULATED / REVIEWED
}

export interface SystemFlowProps {
  systemId: string;
  projectId: string;
  status: string;
  initialMeta: Meta;
  initialInput: StationInput;
  /** Текст расчёта Kimi из кеша (kimiCalc.output), если есть. */
  initialCalc?: string;
  /** Утверждён ли снапшот. */
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

  const st = SYSTEM_STATUS[status] ?? { label: status, variant: 'default' as const };
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

  return (
    <div className={wiz.layout}>
      {/* Степпер-шапка */}
      <nav className={wiz.steps}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx(
              wiz.stepBtn,
              i === step && wiz.stepActive,
              i < stepForStatus(status) && wiz.stepDone,
            )}
            onClick={() => setStep(i)}
          >
            <span className={wiz.stepNum}>{i < stepForStatus(status) ? '✓' : i + 1}</span>
            <span>
              <span className={wiz.stepTitle}>{s.title}</span>
              <span className={wiz.stepHint}>{s.hint}</span>
            </span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
      </nav>

      {error && <div className={wiz.errorBox}>{error}</div>}

      {/* Шаг 1 — Вход (карточка) */}
      {step === 0 && (
        <SystemWizard
          systemId={systemId}
          projectId={projectId}
          initialMeta={initialMeta}
          initialInput={initialInput}
          onComplete={() => setStep(1)}
        />
      )}

      {/* Шаг 2 — Расчёт через Kimi */}
      {step === 1 && (
        <div>
          <KimiCalcPanel systemId={systemId} initialOutput={initialCalc} />
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
        </div>
      )}

      {/* Шаг 3 — Утверждение / снапшот */}
      {step === 2 && (
        <Card title="Утверждение">
          {isFinalized ? (
            <>
              <p style={{ fontSize: 14, marginTop: 0 }}>
                ✅ Расчёт <b>утверждён</b>
                {approvedAt
                  ? ` ${new Date(approvedAt).toLocaleString('ru-RU')}`
                  : ''}
                . Данные заморожены — ТКП формируется из этого снапшота.
              </p>
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
                Расчёт ещё не утверждён. Вернитесь к шагу «Расчёт» и нажмите
                «Утвердить расчёт».
              </p>
              <Button variant="secondary" onClick={() => setStep(1)}>
                ← К расчёту
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
