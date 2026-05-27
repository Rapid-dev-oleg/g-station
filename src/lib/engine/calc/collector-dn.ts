/**
 * Подбор DN коллектора — правила 5.1 v2, 5.3 v3, 5.9.
 *
 * 5.1 v2 — DN от расхода станции; запас при Q ≥ 80 % верхней границы.
 * 5.3 v3 — floor (+1 типоразмер) применяется ТОЛЬКО при патрубке ≤ DN50;
 *          для патрубка ≥ DN65 расход рулит (правка после anohin-08).
 *          При N ≥ 4 — запас +1 типоразмер (правка после anohin-10 ВНС).
 * 5.9    — под заливом всас можно не увеличивать против напорного.
 */

import type { CollectorDnByFlowRule, CollectorFloorRule, Rules } from '../rules';
import {
  DN_RESERVE_THRESHOLD,
  DN_SERIES,
  dischargeDnByFlow,
  dnStepUp,
  suctionDnByFlow,
} from './norms';

export interface CollectorDnInput {
  /** Расход станции для расчёта DN (м³/ч). Для наружного ПТ — Q_тушения (правило 5.10). */
  qStation: number;
  /** Оценочный DN патрубка одного насоса. */
  nozzleDn: number;
  /** Полное число насосов на станции (рабочие + резерв). */
  pumpsCount: number;
  /** Установка «под заливом» — правило 5.9. */
  underFlood: boolean;
}

export interface CollectorDnResult {
  discharge: number;
  suction: number;
  /** Краткая трасса принятых решений для note. */
  note: string;
}

/** Дефолтная конфигурация 5.3 v3 (если rule не передан). */
const DEFAULT_FLOOR: Omit<CollectorFloorRule, 'ruleId' | 'version'> = {
  smallNozzleDnMax: 50,
  smallNozzleSteps: 1,
  manyPumpsThreshold: 4,
  manyPumpsSteps: 1,
};

export function resolveCollectorDn(args: CollectorDnInput, rules?: Rules): CollectorDnResult {
  const { qStation, nozzleDn, pumpsCount, underFlood } = args;
  const flow: CollectorDnByFlowRule | undefined = rules?.collectorDnByFlow;
  const floorCfg = rules?.collectorFloor ?? { ...DEFAULT_FLOOR, ruleId: '5.3-collector-floor', version: 'fallback' };
  const threshold = flow?.reserveThreshold ?? DN_RESERVE_THRESHOLD;

  const dischByFlow = dischargeDnByFlow(qStation, threshold);
  const suctByFlow = suctionDnByFlow(qStation, threshold);

  const notes: string[] = [];

  let floor = 0;
  if (nozzleDn <= floorCfg.smallNozzleDnMax) {
    floor = dnStepUp(nozzleDn, floorCfg.smallNozzleSteps);
    notes.push(
      `floor (патрубок DN${nozzleDn} ≤ ${floorCfg.smallNozzleDnMax}) +${floorCfg.smallNozzleSteps} = DN${floor}`,
    );
  }

  let discharge = Math.max(dischByFlow, floor);
  let suction = underFlood ? discharge : Math.max(suctByFlow, floor, discharge);

  if (pumpsCount >= floorCfg.manyPumpsThreshold) {
    const before = { discharge, suction };
    discharge = stepUpN(discharge, floorCfg.manyPumpsSteps);
    suction = stepUpN(suction, floorCfg.manyPumpsSteps);
    notes.push(
      `N=${pumpsCount} ≥ ${floorCfg.manyPumpsThreshold} → запас +${floorCfg.manyPumpsSteps}: ` +
        `${before.discharge}→${discharge}, ${before.suction}→${suction}`,
    );
  }

  notes.unshift(`по расходу: всас DN${suctByFlow}, напор DN${dischByFlow}`);
  return { discharge, suction, note: notes.join('; ') };
}

function stepUpN(dn: number, steps: number): number {
  const idx = DN_SERIES.indexOf(dn);
  if (idx < 0) return dn;
  return DN_SERIES[Math.min(idx + steps, DN_SERIES.length - 1)];
}
