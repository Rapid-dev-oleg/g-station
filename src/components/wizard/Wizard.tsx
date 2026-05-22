'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Button, Card, IconArrowLeft, IconArrowRight, IconCheck, IconSparkles, toast,
} from '@/components/ui';
import { BomReplaceButton, OverridesBanner } from '@/components/bom';
import { useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { findPumpBySku } from '@/lib/catalog/pumps';
import { findPanelBySku } from '@/lib/catalog/panels';
import { inlineSchemaSvg } from '@/lib/ai/imagen';
import { formatRub, systemTypeLabel } from '@/lib/format';
import type { SystemConfig } from '@/lib/types';
import { WIZARD_STEPS, type WizardStepKey } from './types';
import { renderStep } from './WizardSteps';
import { LiveSummary } from './LiveSummary';
import styles from './Wizard.module.css';

function setByPath<T extends Record<string, any>>(obj: T, path: string, value: any): T {
  const keys = path.split('.');
  const clone: any = { ...obj };
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] ?? {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

export interface WizardProps {
  projectId: string;
  systemId: string;
}

export function Wizard({ projectId, systemId }: WizardProps) {
  const router = useRouter();
  const params = useSearchParams();
  const isPrefilled = params?.get('prefilled') === 'true';
  const updateSystem = useProjectsStore((s) => s.updateSystem);
  const system = useProjectsStore((s) => s.findById(projectId)?.systems.find((x) => x.id === systemId));
  const [draft, setDraft] = useState<SystemConfig | undefined>(system);
  const [stepIdx, setStepIdx] = useState(0);
  const [calcInProgress, setCalcInProgress] = useState(false);
  const [calcDone, setCalcDone] = useState(Boolean(system?.computed));
  const [savedAt, setSavedAt] = useState<string>('');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Восстановление из localStorage если есть
  useEffect(() => {
    if (!system) return;
    if (!draft) setDraft(system);
    try {
      const raw = localStorage.getItem(`wizard:${systemId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.updatedAt && new Date(parsed.updatedAt) > new Date(system.updatedAt)) {
          setDraft(parsed);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system?.id]);

  // Когда юзер делает override через SkuPicker — store обновляет
  // system.overrides/bom/totalCost. Синхронизируем draft, чтобы UI
  // мгновенно показал новый BOM. Сравнение по updatedAt из store.
  useEffect(() => {
    if (!system || !draft) return;
    if (new Date(system.updatedAt) > new Date(draft.updatedAt ?? 0)) {
      setDraft(system);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system?.updatedAt, system?.overrides, system?.totalCost]);

  const update = (path: string, value: any) => {
    setDraft((cur) => (cur ? setByPath(cur, path, value) : cur));
  };

  // Авто-сохранение каждые 2 сек
  useEffect(() => {
    if (!draft) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(`wizard:${systemId}`, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
        setSavedAt(new Date().toLocaleTimeString('ru-RU'));
      } catch {}
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [draft, systemId]);

  const stepKey = WIZARD_STEPS[stepIdx]?.key;

  const runCalc = () => {
    if (!draft) return;
    setCalcInProgress(true);
    setCalcDone(false);
    setTimeout(() => {
      const r = compute(draft);
      const next = {
        ...draft,
        computed: r.computed,
        bom: r.bom,
        totalCost: r.totalCost,
        status: 'calculated' as const,
        updatedAt: new Date().toISOString(),
      } as SystemConfig;
      setDraft(next);
      setCalcInProgress(false);
      setCalcDone(true);
    }, 1500);
  };

  const persist = (finalStatus?: SystemConfig['status']) => {
    if (!draft) return;
    const next = finalStatus ? ({ ...draft, status: finalStatus } as SystemConfig) : draft;
    updateSystem(projectId, systemId, next);
    try { localStorage.removeItem(`wizard:${systemId}`); } catch {}
    toast.success('Система сохранена');
  };

  if (!system || !draft) {
    return (
      <Card>
        <p>Система не найдена.</p>
      </Card>
    );
  }

  const calcResult = draft.computed
    ? { computed: draft.computed, bom: draft.bom ?? [], totalCost: draft.totalCost ?? 0 }
    : null;
  const pump = calcResult?.computed.selectedPumpSku ? findPumpBySku(calcResult.computed.selectedPumpSku) : undefined;
  const panel = calcResult?.computed.selectedPanelSku ? findPanelBySku(calcResult.computed.selectedPanelSku) : undefined;

  const stepContent = (() => {
    if (stepKey === 'calc') {
      return (
        <div className={styles.calcArea}>
          <div>
            <div className={styles.stepTitle}>Подбор оборудования</div>
            <div className={styles.stepHint}>Нажмите «Рассчитать» — алгоритм подберёт насос, шкаф и комплектацию.</div>
          </div>
          {!calcInProgress && !calcResult && (
            <Button size="lg" leftIcon={<IconCheck />} onClick={runCalc}>
              Рассчитать
            </Button>
          )}
          {calcInProgress && (
            <div className={styles.calcStatus}>
              <div className={styles.calcSpinner} />
              <div style={{ fontWeight: 600 }}>Подбираем насос…</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                Анализируем рабочую точку, шкаф, комплектацию
              </div>
            </div>
          )}
          {calcResult && !calcInProgress && (
            <>
              <div
                className={styles.calcSchema}
                dangerouslySetInnerHTML={{ __html: inlineSchemaSvg(draft) }}
              />
              {(calcResult.computed.warnings ?? []).map((w, i) => (
                <div key={i} className={styles.warning}>{w}</div>
              ))}
              <div className={styles.resultGrid}>
                <Card compact title="Подобрано">
                  {pump && (
                    <div className={styles.resultStat}>
                      <span className={styles.resultLabel}>Насос</span>
                      <span className={styles.resultValue}>{pump.model}</span>
                    </div>
                  )}
                  {panel && (
                    <div className={styles.resultStat}>
                      <span className={styles.resultLabel}>Шкаф управления</span>
                      <span className={styles.resultValue}>{panel.model}</span>
                    </div>
                  )}
                  {calcResult.computed.totalPower !== undefined && (
                    <div className={styles.resultStat}>
                      <span className={styles.resultLabel}>Σ мощности</span>
                      <span className={styles.resultValue}>{calcResult.computed.totalPower.toFixed(1)} кВт</span>
                    </div>
                  )}
                  {calcResult.computed.reservoirVolume !== undefined && (
                    <div className={styles.resultStat}>
                      <span className={styles.resultLabel}>V резервуара</span>
                      <span className={styles.resultValue}>{calcResult.computed.reservoirVolume.toFixed(2)} м³</span>
                    </div>
                  )}
                  <div className={styles.resultStat}>
                    <span className={styles.resultLabel}>Σ закупки</span>
                    <span className={styles.resultValue} style={{ color: 'var(--brand-dark)', fontSize: 16 }}>
                      {formatRub(calcResult.totalCost, { decimals: 0 })}
                    </span>
                  </div>
                </Card>
                <Card compact title="Спецификация (BOM)" subtitle={`${calcResult.bom.length} позиций`}>
                  <OverridesBanner projectId={projectId} system={draft} />
                  {calcResult.bom.length === 0 ? (
                    <div style={{ color: 'var(--muted)' }}>Спецификация пуста</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                      {calcResult.bom.map((b) => (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {b.position}. {b.name}
                            {b.quantity > 1 && <span style={{ color: 'var(--muted)' }}> ×{b.quantity}</span>}
                          </span>
                          <BomReplaceButton projectId={projectId} system={draft} bomItem={b} />
                          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {formatRub(b.purchaseCost, { decimals: 0 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
              <Button leftIcon={<IconCheck />} onClick={runCalc} variant="secondary">
                Пересчитать
              </Button>
            </>
          )}
        </div>
      );
    }
    if (stepKey === 'preview') {
      return (
        <div className={styles.calcArea}>
          <div>
            <div className={styles.stepTitle}>Превью системы</div>
            <div className={styles.stepHint}>Проверьте и сохраните — изменения попадут в карточку проекта</div>
          </div>
          <Card compact>
            <div className={styles.resultStat}>
              <span className={styles.resultLabel}>Название</span>
              <span className={styles.resultValue}>{draft.name}</span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultLabel}>Тип</span>
              <span className={styles.resultValue}>{systemTypeLabel(draft.type)}</span>
            </div>
            {calcResult && (
              <div className={styles.resultStat}>
                <span className={styles.resultLabel}>Σ закупки</span>
                <span className={styles.resultValue} style={{ color: 'var(--brand-dark)' }}>
                  {formatRub(calcResult.totalCost, { decimals: 0 })}
                </span>
              </div>
            )}
          </Card>
          <div className={styles.calcSchema} dangerouslySetInnerHTML={{ __html: inlineSchemaSvg(draft) }} />
          {calcResult && calcResult.bom.length > 0 && (
            <Card compact title="Спецификация" subtitle={`${calcResult.bom.length} позиций · нажмите ↻ чтобы заменить`}>
              <OverridesBanner projectId={projectId} system={draft} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {calcResult.bom.map((b) => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {b.position}. {b.name}
                      {b.quantity > 1 && <span style={{ color: 'var(--muted)' }}> ×{b.quantity}</span>}
                    </span>
                    <BomReplaceButton projectId={projectId} system={draft} bomItem={b} />
                    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatRub(b.purchaseCost, { decimals: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      );
    }
    if (stepKey) return renderStep(stepKey, draft, update);
    return null;
  })();

  return (
    <div className={styles.layout}>
      <div className={styles.steps}>
        {WIZARD_STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <button
              key={s.key}
              type="button"
              className={[styles.stepBtn, active ? styles.stepActive : ''].join(' ')}
              onClick={() => setStepIdx(i)}
            >
              <span
                className={[styles.stepDot, active ? styles.stepDotActive : '', done ? styles.stepDotDone : ''].join(' ')}
              >
                {done ? <IconCheck width={12} height={12} /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      <Card>
        {isPrefilled && (
          <div className={styles.banner}>
            <IconSparkles />
            AI заполнил поля на основе ТЗ. Проверьте параметры и подправьте при необходимости.
          </div>
        )}
        {stepKey && stepKey !== 'calc' && stepKey !== 'preview' && (
          <>
            <div className={styles.stepTitle}>
              {WIZARD_STEPS[stepIdx].label}
              <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>
                шаг {stepIdx + 1} из {WIZARD_STEPS.length}
              </span>
            </div>
            <div className={styles.stepHint}>{WIZARD_STEPS[stepIdx].hint}</div>
          </>
        )}

        {stepContent}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            leftIcon={<IconArrowLeft />}
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0}
          >
            Назад
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {savedAt && <span className={styles.savedNote}>Сохранено в {savedAt}</span>}
            {stepIdx < WIZARD_STEPS.length - 1 ? (
              <Button rightIcon={<IconArrowRight />} onClick={() => setStepIdx((s) => s + 1)}>
                Далее
              </Button>
            ) : (
              <Button
                leftIcon={<IconCheck />}
                onClick={() => {
                  persist(calcDone ? 'calculated' : draft.status);
                  router.push(`/projects/${projectId}`);
                }}
              >
                Завершить и сохранить
              </Button>
            )}
          </div>
        </div>
      </Card>

      <LiveSummary system={draft} />
    </div>
  );
}
