/**
 * Шаг 2 — Расчёт + вариативность.
 *
 * Рабочая точка (запас 5–10 %), диаметр коллектора, оценка мощности,
 * тип пуска, жокей-насос. Нормативный расчёт делегируется модулю типа.
 * Заполняет `station.calc`; создаёт `variants[]` если пуст.
 */

import type { Station, StationCalc, Variant } from '@/lib/dossier/types';
import { measured } from '@/lib/dossier/factory';
import type { TypeModule } from '../types';
import { estimateMotor } from '../calc/power';
import {
  collectorLosses,
} from '../calc/hydraulics';
import {
  dischargeDnByFlow,
  dnStepUp,
  roundUpDn,
  suctionDnByFlow,
} from '../calc/norms';
import { decideStartType } from '../calc/start-type';

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
export function processStation2(station: Station, module: TypeModule): void {
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
  const normCalc = module.computeNormative(station);
  Object.assign(calc, normCalc);

  // 2.3. Схема резервирования — берётся из input; число рабочих.
  const scheme = input.reservation_scheme;
  const nWorking = workingPumps(scheme);
  // расход на один насос
  const qPerPump = nWorking > 0 ? qWp / nWorking : qWp;

  // 2.4. Диаметр коллектора — по СУММАРНОМУ расходу станции (правило 5.4).
  // floor: патрубок насоса + 2 типоразмера (правило 5.3) — здесь патрубок
  // оценивается по расходу одного насоса.
  const dischByFlow = dischargeDnByFlow(qWp);
  const suctByFlow = suctionDnByFlow(qWp);
  const nozzleEstimate = roundUpDn(dischargeDnByFlow(qPerPump));
  const floorDn = dnStepUp(nozzleEstimate, 2);
  // под заливом — всас можно не увеличивать (правило 5.9)
  const underFlood = input.installation_place === 'под-заливом';
  const dischDn = Math.max(dischByFlow, floorDn);
  const suctDn = underFlood
    ? dischDn
    : Math.max(suctByFlow, floorDn, dischDn);

  if (input.reservation_scheme !== '1/0') {
    calc.collector_D_discharge = measured(
      dischDn,
      'мм',
      'calculated',
      `по расходу ${qWp.toFixed(0)} м³/ч; floor (патрубок+2)=${floorDn}; разброс ±1 типоразмер`,
    );
    calc.collector_D_suction = measured(
      suctDn,
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
  const nWorking = workingPumps(station.input.reservation_scheme);
  const qPerPump = nWorking > 0 ? qWp / nWorking : qWp;
  return estimateMotor(qPerPump, hWp);
}
