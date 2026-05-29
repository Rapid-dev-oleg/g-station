/**
 * Шаг 3 — Подбор оборудования (по варианту).
 *
 * Подбор насоса по Q/H — КЛАСС / типоразмер / мощность (НЕ точный артикул:
 * это решение инженера, нужны напорные кривые ПО производителя).
 * Коллектор; спец-часть делегируется модулю типа.
 */

import type { Equipment, Station, Variant } from '@/lib/dossier/types';
import { measured } from '@/lib/dossier/factory';
import { fireModule } from '../types/fire';
import type { Catalog } from '../catalog';
import type { Rules } from '../rules';
import { motorForStation } from './step2-calc';
import { evalPumpClass } from '../calc/pump-class';
import { evalBrandMap } from '../calc/brand-map';

/** Число насосов по схеме. */
function pumpCount(scheme: string): number {
  switch (scheme) {
    case '1/0':
      return 1;
    case '1/1':
      return 2;
    case '2/1':
      return 3;
    case '2/2':
      return 4;
    case '3/1':
      return 4;
    default:
      return 2;
  }
}

/** Рабочих насосов по схеме (для Q_per_pump). */
function workingPumps(scheme: string): number {
  return Number(scheme.split('/')[0]) || 1;
}

/**
 * Шаг 3 для одного варианта. Заполняет `variant.equipment`.
 * Мутирует переданный (клонированный) объект.
 */
export function processVariant3(
  station: Station,
  variant: Variant,
  catalog?: Catalog,
  rules?: Rules,
): void {
  const { input, calc } = station;
  if (!calc) return;

  const scheme = variant.reservation_scheme ?? input.reservation_scheme ?? '1/1';
  const nPumps = pumpCount(scheme);
  const qWp = calc.working_point?.Q?.value ?? input.Q?.value ?? 0;
  const hWp = calc.working_point?.H?.value ?? input.H?.value ?? 0;

  const equipment: Equipment = { ...(variant.equipment ?? {}) };

  // ── 3.1. Основной насос — класс/типоразмер/мощность, не артикул ──────
  const motor = motorForStation(station);
  const qPerPump = qWp / workingPumps(scheme);
  // Правило 3.10 — карта аналогов брендов; если ТЗ называет референс,
  // его класс переопределяет матрицу 3.9-A (часть «физики ТЗ»).
  // analog_reference из Meta пробрасывается в pump_type_required парсером ТЗ.
  const brandHit = evalBrandMap(
    { pumpTypeRequired: input.pump_type_required },
    rules,
  );
  const cls = brandHit
    ? {
        classCode: brandHit.entry.classCode,
        construction: brandHit.entry.construction,
        seriesHint: brandHit.entry.cnpSeries,
        triggerId: `3.10:${brandHit.entry.id} (match «${brandHit.matchedToken}» в «${brandHit.source}»)`,
        rpm: undefined as number | undefined,
      }
    : evalPumpClass(
        {
          qPerPump,
          hTarget: hWp,
          stationEnclosure: input.station_enclosure,
          installationPlace: input.installation_place,
          required: input.pump_type_required,
        },
        rules,
      );
  // проверка существования типоразмера в каталоге по мощности (если он есть)
  let stockNote: string;
  if (catalog) {
    const catalogMatches = catalog.findPumpsByPower(motor.motorKw, 0.6);
    stockNote =
      catalogMatches.length > 0
        ? `в каталоге есть ${catalogMatches.length} позиц. ~${motor.motorKw} кВт`
        : 'типоразмер уточнить — в каталоге нет позиции на эту мощность';
  } else {
    stockNote = 'каталог не подключён — типоразмер уточнить по прайсу';
  }

  equipment.main_pump = {
    ...(equipment.main_pump ?? {}),
    // бренд НЕ выбираем — решение инженера (склад, цена)
    brand: equipment.main_pump?.brand,
    // точную модель НЕ выбираем — решение инженера (напорные кривые ПО)
    model: equipment.main_pump?.model,
    qty: nPumps,
    motor_power: measured(
      motor.motorKw,
      'кВт',
      'calculated',
      `P_вал≈${motor.shaftKw.toFixed(1)} кВт (η=${motor.efficiency}), запас k=${motor.reserveK}`,
    ),
    construction: cls.construction,
    class_code: cls.classCode,
    series_hint: cls.seriesHint,
    in_stock: `класс ${cls.classCode} (${cls.triggerId}); серия-ориентир: ${cls.seriesHint}; ${stockNote}; точная модель/бренд — решение инженера`,
  };

  // ── 3.2. Жокей-насос ─────────────────────────────────────────────────
  if (input.jockey_required) {
    equipment.jockey_pump = {
      ...(equipment.jockey_pump ?? {}),
      brand: equipment.jockey_pump?.brand,
      model: equipment.jockey_pump?.model,
      motor_power: equipment.jockey_pump?.motor_power ?? measured(1.5, 'кВт', 'assumed'),
    };
    equipment.instrumentation = {
      ...(equipment.instrumentation ?? {}),
      membrane_tank: equipment.instrumentation?.membrane_tank ?? 'Мембранный бак ≥40 л',
    };
  }

  // ── 3.3. Коллектор ───────────────────────────────────────────────────
  if (scheme !== '1/0') {
    const dSuc = calc.collector_D_suction?.value;
    const dDis = calc.collector_D_discharge?.value;
    if (dSuc != null && dDis != null) {
      // шифр коллектора: Dвсас/Dнапор-N-dвсас/dнапор;
      // патрубок насоса оценочно — на 2 типоразмера меньше коллектора
      const nozzleSuc = dSuc;
      const nozzleDis = dDis;
      const code =
        dSuc === dDis
          ? `${dDis}-${nPumps}-${nozzleDis}`
          : `${dSuc}/${dDis}-${nPumps}-${nozzleSuc}/${nozzleDis}`;
      equipment.collector = {
        ...(equipment.collector ?? {}),
        code,
      };
    }
  } else {
    // станция на 1 насосе — коллектора нет, «обвязка насоса»
    equipment.extra = [
      ...(equipment.extra ?? []),
      { name: 'Обвязка насоса', spec: 'станция на 1 насосе — коллектор не предусмотрен' },
    ];
  }

  // ── 3.6. Доп. оборудование (общее) ───────────────────────────────────
  equipment.valves = {
    ...(equipment.valves ?? {}),
    check_valve: equipment.valves?.check_valve ?? `Обратный клапан — ${nPumps} шт. (по 1 на насос)`,
    disc_valve:
      equipment.valves?.disc_valve ??
      `Дисковый затвор — ${nPumps * 2 + 2} шт. (2 на насос + 2 на коллектор)`,
  };
  equipment.instrumentation = {
    ...(equipment.instrumentation ?? {}),
    pressure_relay: equipment.instrumentation?.pressure_relay ?? 'Реле давления',
    manometer: equipment.instrumentation?.manometer ?? 'Манометр',
  };

  // ── 3.5. Корпус и резервуары ─────────────────────────────────────────
  if (input.station_enclosure) {
    equipment.housing = {
      ...(equipment.housing ?? {}),
      type: equipment.housing?.type ?? input.station_enclosure,
    };
  }
  if (input.reservoirs?.required) {
    const isUnderground =
      input.station_enclosure === 'подземное-стеклопластик' ||
      input.station_enclosure === 'стеклопластиковый-колодец';
    equipment.reservoirs = {
      ...(equipment.reservoirs ?? {}),
      count: input.reservoirs.count ?? 2,
      volume:
        equipment.reservoirs?.volume ??
        (calc.reservoir_volume_rounded?.value != null
          ? measured(calc.reservoir_volume_rounded.value, 'м³', 'calculated')
          : undefined),
    };
    void isUnderground;
  }

  // ── 3.4 + спец-часть типа — делегируется модулю ──────────────────────
  variant.equipment = equipment;
  variant.equipment = fireModule.selectEquipment(variant, calc, input, rules);
}
