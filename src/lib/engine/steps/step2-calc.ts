/**
 * Шаг 2 — Расчёт + вариативность.
 *
 * Рабочая точка (запас 5–10 %), диаметр коллектора, оценка мощности,
 * тип пуска, жокей-насос. Нормативный расчёт делегируется модулю типа.
 * Заполняет `station.calc`; создаёт `variants[]` если пуст.
 */

import type { Station, StationCalc, Variant } from '@/lib/dossier/types';
import { measured } from '@/lib/dossier/factory';
import { fireModule } from '../types/fire';
import { estimateMotor } from '../calc/power';
import {
  collectorLosses,
} from '../calc/hydraulics';
import {
  dischargeDnByFlow,
  roundUpDn,
} from '../calc/norms';
import { resolveCollectorDn } from '../calc/collector-dn';
import { decideStartType } from '../calc/start-type';
import type { Rules } from '../rules';

/** Запас рабочей точки над ТЗ — середина диапазона 5–10 %. */
export const WORKING_POINT_MARGIN = 0.08;

/** Рабочих насосов по схеме (первое число). */
function workingPumps(scheme: string): number {
  return Number(scheme.split('/')[0]) || 1;
}

/** Перевод давления в метры водяного столба по единице измерения. */
function toMeters(value: number, unit?: string): number {
  if (!value) return 0;
  const u = (unit ?? '').toLowerCase();
  if (u.includes('бар') || u === 'bar') return value * 10;
  if (u.includes('мпа') || u === 'mpa') return value * 100;
  return value; // м, м.вод.ст. или единица не указана
}

/**
 * Шаг 2 для одной станции. Заполняет `calc` и при необходимости `variants`.
 * Мутирует переданный (клонированный) объект.
 */
export function processStation2(station: Station, rules?: Rules): void {
  const { input } = station;
  const calc: StationCalc = { ...(station.calc ?? {}) };

  const qTz = input.Q?.value ?? 0;
  const hTz = input.H?.value ?? 0;
  // Давление на вводе нормализуем в метры: 1 бар ≈ 10 м, 1 МПа ≈ 100 м.
  const inletH = toMeters(input.inlet_pressure?.value ?? 0, input.inlet_pressure?.unit);

  // 2.1. Рабочая точка.
  calc.Q_target = measured(qTz, 'м³/ч', 'calculated', 'расход станции из ТЗ');
  const hTarget = hTz - inletH;
  calc.H_target = measured(
    hTarget,
    'м',
    'calculated',
    inletH > 0
      ? `H = ${hTz} − ${inletH} (давление на вводе вычтено однократно)`
      : 'напор станции из ТЗ',
  );

  // точка ТП — запас 5–10 % вверх
  const qWp = Math.round(qTz * (1 + WORKING_POINT_MARGIN) * 10) / 10;
  const hWp = Math.ceil(hTarget * (1 + WORKING_POINT_MARGIN));
  calc.working_point = {
    Q: measured(qWp, 'м³/ч', 'calculated'),
    H: measured(hWp, 'м', 'calculated'),
    reserve_margin: measured(WORKING_POINT_MARGIN * 100, '%', 'calculated', 'запас 5–10 %'),
  };

  // 2.2. Нормативный расчёт типа (объём пожарного запаса и т.п.).
  const normCalc = fireModule.computeNormative(station);
  Object.assign(calc, normCalc);

  // 2.3. Схема резервирования — берётся из input; число рабочих.
  const scheme = input.reservation_scheme ?? '1/1';
  const nWorking = workingPumps(scheme);
  // расход на один насос
  const qPerPump = nWorking > 0 ? qWp / nWorking : qWp;

  // 2.4. Диаметр коллектора — правила 5.1 v2, 5.3 v3, 5.4, 5.9, 5.10.
  // Для наружного ПТ DN считается от Q_тушения (СП 8.13130), если оно
  // больше Q рабочей точки (правило 5.10, после nikitin-07).
  const fireFlowLs = input.fire_params?.fire_flow_rate?.value;
  const qFireM3h =
    input.purpose === 'наружное-ПТ' && fireFlowLs != null ? fireFlowLs * 3.6 : 0;
  const qForDn = Math.max(qWp, qFireM3h);
  const nozzleEstimate = roundUpDn(dischargeDnByFlow(qPerPump));
  const underFlood = input.installation_place === 'под-заливом';
  const dn = resolveCollectorDn(
    {
      qStation: qForDn,
      nozzleDn: nozzleEstimate,
      pumpsCount: nWorking + (Number(scheme.split('/')[1]) || 0),
      underFlood,
    },
    rules,
  );

  if (input.reservation_scheme !== '1/0') {
    const sourceNote =
      qFireM3h > qWp
        ? `Q_тушения ${qFireM3h.toFixed(0)} м³/ч (СП 8.13130) больше Q_wp ${qWp.toFixed(0)}; DN от Q_тушения`
        : `по расходу ${qForDn.toFixed(0)} м³/ч`;
    calc.collector_D_discharge = measured(
      dn.discharge,
      'мм',
      'calculated',
      `${sourceNote}; ${dn.note}`,
    );
    calc.collector_D_suction = measured(
      dn.suction,
      'мм',
      'calculated',
      underFlood
        ? 'под заливом — всас не увеличивается против напорного (правило 5.9)'
        : 'всас крупнее напорного (скорость всаса ниже)',
    );
  }

  // 2.5. Оценка мощности двигателя (по одному насосу на точку ТП).
  const motor = estimateMotor(qPerPump, hWp);
  // оценка потерь в коллекторе — для информации в note
  const losses = calc.collector_D_discharge?.value
    ? collectorLosses(qWp, calc.collector_D_discharge.value)
    : 0;

  // 2.6. Тип пуска.
  const startDecision = decideStartType(
    input.station_type,
    motor.motorKw,
    input.start_type,
    input.power_supply,
  );
  if (startDecision.startType && !input.start_type) {
    input.start_type = startDecision.startType;
  }
  if (startDecision.toGate) {
    const assumptions = [...(input.assumptions ?? [])];
    assumptions.push(`Тип пуска — на гейт инженера: ${startDecision.rationale}`);
    input.assumptions = assumptions;
  }

  // 2.7. Жокей-насос.
  if (input.jockey_required) {
    const jQ = input.jockey_Q?.value ?? 4; // 3–5 м³/ч, середина
    const jH = input.jockey_H?.value ?? hWp + 10; // H осн. + 10 м
    calc.jockey_Q_calc = measured(
      jQ,
      'м³/ч',
      'calculated',
      input.jockey_Q?.value != null ? 'из ТЗ' : 'норма 3–5 м³/ч (принято 4)',
    );
    calc.jockey_H_calc = measured(
      jH,
      'м',
      'calculated',
      input.jockey_H?.value != null ? 'из ТЗ' : 'H осн. + 10 м',
    );
  }

  station.calc = calc;

  // 2.8. Вариативность — создать вариант, если variants пуст.
  if (!station.variants || station.variants.length === 0) {
    const variant: Variant = {
      name: 'основной',
      reservation_scheme: scheme,
    };
    station.variants = [variant];
  } else {
    // проставить схему вариантам без неё
    for (const v of station.variants) {
      if (!v.reservation_scheme) v.reservation_scheme = scheme;
    }
  }

  // Передать оценку мощности и потери дальше через calc.note (для шага 3).
  // Сохраняем мощность в working_point note для прозрачности.
  if (calc.working_point?.H) {
    calc.working_point.H.note =
      `P_вал≈${motor.shaftKw.toFixed(1)} кВт (η=${motor.efficiency}); ` +
      `двигатель ${motor.motorKw} кВт; потери в коллекторе≈${losses.toFixed(1)} м`;
  }
}

/**
 * Оценка мощности двигателя для шага 3 (повторяет расчёт шага 2).
 * Вынесено отдельно, чтобы шаг 3 не зависел от note-строки.
 */
export function motorForStation(station: Station): ReturnType<typeof estimateMotor> {
  const qWp = station.calc?.working_point?.Q?.value ?? station.input.Q?.value ?? 0;
  const hWp = station.calc?.working_point?.H?.value ?? station.input.H?.value ?? 0;
  const nWorking = workingPumps(station.input.reservation_scheme ?? '1/1');
  const qPerPump = nWorking > 0 ? qWp / nWorking : qWp;
  return estimateMotor(qPerPump, hWp);
}
