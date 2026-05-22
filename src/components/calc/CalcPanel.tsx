'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, IconCheck, Table } from '@/components/ui';
import { formatRub } from '@/lib/format';
import type { Dossier, Station } from '@/lib/dossier/types';
import type { GateReport } from '@/lib/engine/gates';
import { runSystemCalc } from '@/server/actions/calc';
import { GatesView } from './GatesView';
import styles from './Calc.module.css';

export interface CalcPanelProps {
  systemId: string;
  initialDossier: Dossier;
  initialGates: GateReport[];
  /** true — расчёт уже выполнялся (статус CALCULATED). */
  alreadyCalculated: boolean;
}

function num(v: number | null | undefined, unit?: string): string {
  if (v == null) return '—';
  return unit ? `${v} ${unit}` : String(v);
}

export function CalcPanel({
  systemId,
  initialDossier,
  initialGates,
  alreadyCalculated,
}: CalcPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dossier, setDossier] = useState<Dossier>(initialDossier);
  const [gates, setGates] = useState<GateReport[]>(initialGates);
  const [done, setDone] = useState(alreadyCalculated);
  const [errors, setErrors] = useState<string[]>([]);

  const run = () => {
    setErrors([]);
    startTransition(async () => {
      const res = await runSystemCalc(systemId);
      if (res.ok) {
        setGates(res.gates);
        setDone(true);
        router.refresh();
      } else {
        setErrors(res.errors);
      }
    });
  };

  const station: Station | undefined = dossier.stations[0];
  const calc = station?.calc;
  const variants = station?.variants ?? [];
  const output = station?.output;
  const selectedIdx = output?.selected_variant ?? 0;

  return (
    <>
      <Card
        title="Расчёт системы"
        subtitle="Прогон расчётного дела через движок подбора"
        action={
          <Button
            leftIcon={<IconCheck />}
            disabled={pending}
            onClick={run}
          >
            {pending
              ? 'Расчёт…'
              : done
                ? 'Пересчитать'
                : 'Рассчитать'}
          </Button>
        }
      >
        {pending && (
          <div className={styles.runArea}>
            <div className={styles.spinner} />
            <div style={{ fontWeight: 600 }}>Подбираем оборудование…</div>
            <div className={styles.muted} style={{ fontSize: 13 }}>
              Гидравлика → нормы → подбор → смета
            </div>
          </div>
        )}

        {!pending && errors.length > 0 && (
          <div className={styles.errorBox}>
            Расчёт не выполнен:
            <ul style={{ marginTop: 6, paddingLeft: 16, listStyle: 'disc' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {!pending && !done && errors.length === 0 && (
          <div className={styles.runArea}>
            <p className={styles.muted}>
              Нажмите «Рассчитать» — движок подберёт насосы, шкаф, коллектор
              и сформирует смету.
            </p>
          </div>
        )}
      </Card>

      {done && !pending && (
        <>
          <div className={styles.resultGrid}>
            <Card title="Расчётные характеристики" compact>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Q расчётный</span>
                <span className={styles.statValue}>
                  {num(calc?.Q_target?.value, calc?.Q_target?.unit)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>H расчётный</span>
                <span className={styles.statValue}>
                  {num(calc?.H_target?.value, calc?.H_target?.unit)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>DN коллектора (всас.)</span>
                <span className={styles.statValue}>
                  {num(calc?.collector_D_suction?.value, 'мм')}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>DN коллектора (нап.)</span>
                <span className={styles.statValue}>
                  {num(calc?.collector_D_discharge?.value, 'мм')}
                </span>
              </div>
              {calc?.fire_reserve_volume?.value != null && (
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Пожарный запас</span>
                  <span className={styles.statValue}>
                    {num(calc.fire_reserve_volume.value, 'м³')}
                  </span>
                </div>
              )}
            </Card>

            <Card title="Шифр изделия" compact>
              {output?.product_code ? (
                <>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontWeight: 600,
                      fontSize: 14,
                      marginBottom: 8,
                    }}
                  >
                    {output.product_code}
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Критерий выбора</span>
                    <span className={styles.statValue}>
                      {output.selection_criterion ?? '—'}
                    </span>
                  </div>
                  {(output.validation_flags ?? []).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {output.validation_flags!.map((f) => (
                        <Badge key={f} variant="warning">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.muted}>Шифр не сформирован.</p>
              )}
            </Card>
          </div>

          <Card
            title="Варианты и оборудование"
            subtitle={`${variants.length} вариант(ов)`}
            style={{ marginBottom: 16 }}
          >
            {variants.length === 0 ? (
              <p className={styles.muted}>Варианты не сформированы.</p>
            ) : (
              variants.map((v, vi) => {
                const eq = v.equipment;
                const pricing = v.pricing;
                return (
                  <div key={vi} className={styles.variant}>
                    <div className={styles.variantHead}>
                      <span className={styles.variantName}>{v.name}</span>
                      {vi === selectedIdx && (
                        <Badge variant="success" withDot>
                          выбран
                        </Badge>
                      )}
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Насос</span>
                      <span className={styles.statValue}>
                        {eq?.main_pump
                          ? `${eq.main_pump.brand ?? ''} ${eq.main_pump.model ?? ''} ×${eq.main_pump.qty ?? 1}`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Шкаф управления</span>
                      <span className={styles.statValue}>
                        {eq?.control_cabinet
                          ? `${eq.control_cabinet.brand ?? ''} ${eq.control_cabinet.series ?? ''}`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Коллектор</span>
                      <span className={styles.statValue}>
                        {eq?.collector?.code ?? '—'}
                      </span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Себестоимость</span>
                      <span className={styles.statValue}>
                        {pricing?.total_cost != null
                          ? formatRub(pricing.total_cost, { decimals: 0 })
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Цена клиента</span>
                      <span className={styles.statValue}>
                        {pricing?.client_price != null
                          ? formatRub(pricing.client_price, { decimals: 0 })
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {variants[selectedIdx]?.pricing?.rows && (
            <Card
              title="Смета выбранного варианта"
              subtitle={`${variants[selectedIdx].pricing!.rows!.length} позиций`}
              style={{ marginBottom: 16 }}
            >
              <Table
                getRowKey={(r) => String(r._i)}
                rows={variants[selectedIdx].pricing!.rows!.map((r, i) => ({
                  ...r,
                  _i: i,
                }))}
                columns={[
                  {
                    key: 'name',
                    header: 'Позиция',
                    render: (r) => r.position_name,
                  },
                  {
                    key: 'qty',
                    header: 'Кол-во',
                    align: 'center',
                    render: (r) => r.qty,
                  },
                  {
                    key: 'price',
                    header: 'Цена',
                    align: 'right',
                    render: (r) =>
                      `${r.price.toLocaleString('ru-RU')} ${r.currency ?? 'RUB'}`,
                  },
                  {
                    key: 'cost',
                    header: 'Стоимость, ₽',
                    align: 'right',
                    render: (r) =>
                      r.purchase_cost != null
                        ? formatRub(r.purchase_cost, { decimals: 0 })
                        : '—',
                  },
                ]}
              />
            </Card>
          )}

          <Card title="Гейты инженера" subtitle="Проверка human-in-the-loop">
            <GatesView gates={gates} />
          </Card>
        </>
      )}
    </>
  );
}
