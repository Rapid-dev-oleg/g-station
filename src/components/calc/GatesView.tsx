'use client';

import { Badge } from '@/components/ui';
import type { GateReport } from '@/lib/engine/gates';
import styles from './Calc.module.css';

const GATE_TITLES: Record<1 | 2 | 3, string> = {
  1: 'Гейт 1 — исходные данные',
  2: 'Гейт 2 — ценообразование',
  3: 'Гейт 3 — выходные решения',
};

const GATE_HINTS: Record<1 | 2 | 3, string> = {
  1: 'Допущения, пустые обязательные поля, тип и сценарий — подтвердите.',
  2: 'Курс валюты, скидки, бренд насоса, коэффициент наценки.',
  3: 'Флаги валидации и зоны, требующие уточнения инженером.',
};

/** Отображение трёх гейтов инженера (human-in-the-loop). */
export function GatesView({ gates }: { gates: GateReport[] }) {
  if (gates.length === 0) {
    return <p className={styles.muted}>Гейты появятся после расчёта.</p>;
  }

  return (
    <>
      {gates.map((g, idx) => (
        <div key={idx} className={styles.gate}>
          <div className={styles.gateHead}>
            <div className={styles.gateTitle}>{GATE_TITLES[g.gate]}</div>
            <Badge variant={g.clear ? 'success' : 'warning'} withDot>
              {g.clear ? 'можно пройти' : `${g.items.length} к проверке`}
            </Badge>
          </div>
          <p className={styles.muted} style={{ fontSize: 12, marginBottom: 8 }}>
            {GATE_HINTS[g.gate]}
          </p>
          {g.items.length === 0 ? (
            <p className={styles.muted} style={{ fontSize: 13 }}>
              Замечаний нет.
            </p>
          ) : (
            g.items.map((item, i) => (
              <div key={i} className={styles.gateItem}>
                <span className={styles.gateField}>{item.field}</span> —{' '}
                {item.issue}
                {item.current && (
                  <span className={styles.gateCurrent}> · {item.current}</span>
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );
}
