'use client';

import { useMemo } from 'react';
import { Badge, Card } from '@/components/ui';
import { compute } from '@/lib/calc';
import { formatRub, systemTypeLabel } from '@/lib/format';
import { findPumpBySku } from '@/lib/catalog/pumps';
import { findPanelBySku } from '@/lib/catalog/panels';
import type { SystemConfig } from '@/lib/types';
import styles from './Wizard.module.css';

export function LiveSummary({ system }: { system: SystemConfig }) {
  const result = useMemo(() => {
    try { return compute(system); } catch { return null; }
  }, [system]);

  const pump = result?.computed.selectedPumpSku ? findPumpBySku(result.computed.selectedPumpSku) : undefined;
  const panel = result?.computed.selectedPanelSku ? findPanelBySku(result.computed.selectedPanelSku) : undefined;

  let Q: number | undefined;
  let H: number | undefined;
  let pumpsCount = 0;
  if (system.type === 'KNS') { Q = system.data.Qmax; H = system.data.headRequired; pumpsCount = system.data.workingPumps + system.data.reservePumps + (system.data.warehousePumps ?? 0); }
  if (system.type === 'FIRE') { Q = system.data.Q; H = system.data.H; pumpsCount = system.data.workingPumps + system.data.reservePumps; }
  if (system.type === 'VNS') { Q = system.data.Qmax; H = system.data.H; pumpsCount = system.data.workingPumps + system.data.reservePumps; }

  return (
    <div className={styles.summary}>
      <Card compact title="Живая сводка">
        <div className={styles.summaryRow}>
          <span>Тип</span>
          <span><Badge variant="info">{systemTypeLabel(system.type)}</Badge></span>
        </div>
        <div className={styles.summaryRow}>
          <span>Q</span>
          <span>{Q !== undefined ? `${Q} м³/ч` : '—'}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>H</span>
          <span>{H !== undefined ? `${H} м` : '—'}</span>
        </div>
        {result?.computed.requiredHead !== undefined && system.type === 'KNS' && (
          <div className={styles.summaryRow}>
            <span>Расчётный H</span>
            <span>{result.computed.requiredHead.toFixed(1)} м</span>
          </div>
        )}
        {result?.computed.velocity !== undefined && (
          <div className={styles.summaryRow}>
            <span>Скорость v</span>
            <span>{result.computed.velocity.toFixed(2)} м/с</span>
          </div>
        )}
        <div className={styles.summaryRow}>
          <span>Насосов</span>
          <span>{pumpsCount}</span>
        </div>
        {pump && (
          <div className={styles.summaryRow}>
            <span>Насос</span>
            <span style={{ fontWeight: 500, fontSize: 12 }}>{pump.model}</span>
          </div>
        )}
        {panel && (
          <div className={styles.summaryRow}>
            <span>ШУ</span>
            <span style={{ fontWeight: 500, fontSize: 12 }}>{panel.model}</span>
          </div>
        )}
        {result?.computed.totalPower !== undefined && (
          <div className={styles.summaryRow}>
            <span>Σ мощности</span>
            <span>{result.computed.totalPower.toFixed(1)} кВт</span>
          </div>
        )}
        {result && result.totalCost > 0 && (
          <div className={styles.summaryRow}>
            <span>Σ закупки</span>
            <span style={{ color: 'var(--brand-dark)' }}>{formatRub(result.totalCost, { decimals: 0 })}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
