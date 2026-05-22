/**
 * Модуль типа FIRE (G-Fire) — пожарные насосные станции.
 * Реализует контракт `TypeModule` по `типы/пожарные.md` (6 разделов).
 */

import type {
  Equipment,
  Output,
  Station,
  StationCalc,
  StationInput,
  Variant,
} from '@/lib/dossier/types';
import { measured } from '@/lib/dossier/factory';
import type { TypeModule } from '../types';
import { ayptFlowLs, fireDurationHours, fireReserveVolume } from '../calc/norms';
import { regulationCode } from '../calc/start-type';

/** Назначения, относящиеся к пожарному типу. */
const FIRE_PURPOSES = new Set([
  'наружное-ПТ',
  'ВПВ',
  'АУПТ',
  'пожаротушение-общее',
  'береговая-ПНС',
]);

/** Число насосов по схеме резервирования. */
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

/** Рабочих насосов по схеме. */
function workingCount(scheme: string): number {
  return Number(scheme.split('/')[0]) || 1;
}

export const fireModule: TypeModule = {
  id: 'fire',
  label: 'G-Fire — пожаротушение',

  // ─── Раздел 1 — Идентификация ─────────────────────────────────────────
  matchTriggers(input: StationInput): number {
    let score = 0;
    if (input.station_type === 'fire') score += 5;
    if (FIRE_PURPOSES.has(input.purpose)) score += 3;
    if (input.fire_params) score += 2;
    if (input.reservoirs?.required) score += 1;
    if (input.purpose === 'хоз-питьевое' || input.purpose === 'повышение-давления') score -= 5;
    return score;
  },

  // ─── Раздел 2 — Нормативная база ──────────────────────────────────────
  norms: [
    'СП 10.13130.2020',
    'СП 8.13130.2020',
    'СП 485.1311500.2020',
    'СП 31.13330.2021',
    'ГОСТ 17376-2001',
    'ГОСТ 10704-91',
  ],

  // ─── Раздел 3 — Опросный лист ─────────────────────────────────────────
  requiredFields(input: StationInput): string[] {
    const fields = [
      'Q',
      'H',
      'reservation_scheme',
      'purpose',
      'start_type',
      'station_enclosure',
    ];
    // объём пожарного запаса — нужны данные для V = Q × t
    if (input.purpose === 'наружное-ПТ' || input.purpose === 'АУПТ') {
      fields.push('reservoirs.volume', 'fire_params.fire_duration');
    }
    if (input.purpose === 'ВПВ') {
      fields.push('fire_params.streams_count', 'fire_params.stream_flow');
    }
    if (input.jockey_required) {
      fields.push('jockey_Q', 'jockey_H');
    }
    // электроснабжение — для выбора способа пуска
    fields.push('power_supply.from_generator');
    return fields;
  },

  // ─── Раздел 4 — Нормативный расчёт ────────────────────────────────────
  computeNormative(station: Station): Partial<StationCalc> {
    const { input } = station;
    const out: Partial<StationCalc> = {};

    // Объём пожарного запаса V = расход × время тушения.
    const reservoirs = input.reservoirs;
    if (reservoirs?.required) {
      // объём задан в ТЗ — берём как есть
      if (reservoirs.volume_given && reservoirs.volume?.value != null) {
        out.fire_reserve_volume = measured(
          reservoirs.volume.value,
          'м³',
          'extracted',
          'объём пожарного запаса задан ТЗ — не пересчитывался',
        );
        out.reservoir_volume_rounded = measured(
          Math.ceil(reservoirs.volume.value),
          'м³',
          'calculated',
        );
      } else {
        // расход тушения, л/с
        let flowLs = input.fire_params?.fire_flow_rate?.value ?? null;
        let flowNote = 'расход тушения из fire_params';
        if (flowLs == null && input.purpose === 'ВПВ') {
          const streams = input.fire_params?.streams_count ?? null;
          const streamFlow = input.fire_params?.stream_flow?.value ?? null;
          if (streams != null && streamFlow != null) {
            flowLs = streams * streamFlow;
            flowNote = `ВПВ: ${streams} струи × ${streamFlow} л/с`;
          }
        }
        if (flowLs == null && input.purpose === 'АУПТ') {
          // группа помещений не задана — берём группу 1 как допущение
          flowLs = ayptFlowLs(1);
          flowNote = 'АУПТ группа 1 (допущение — группа помещений не задана)';
        }
        if (flowLs != null) {
          const durationH =
            input.fire_params?.fire_duration?.value ?? fireDurationHours(input.purpose);
          const flowM3h = flowLs * 3.6;
          const volume = fireReserveVolume(flowM3h, durationH);
          out.fire_reserve_volume = measured(
            volume,
            'м³',
            'calculated',
            `V = ${flowM3h.toFixed(1)} м³/ч × ${durationH} ч (${flowNote})`,
          );
          out.reservoir_volume_rounded = measured(volume, 'м³', 'calculated');
        }
      }
    }

    out.applicable_norms = this.norms;
    return out;
  },

  // ─── Раздел 5 — Особенности подбора оборудования ──────────────────────
  selectEquipment(variant: Variant, calc: StationCalc, input: StationInput): Equipment {
    const eq: Equipment = { ...(variant.equipment ?? {}) };
    const scheme = variant.reservation_scheme ?? input.reservation_scheme;
    const motorKw = eq.main_pump?.motor_power?.value ?? null;
    const isUnderground =
      input.station_enclosure === 'подземное-стеклопластик' ||
      input.station_enclosure === 'стеклопластиковый-колодец' ||
      input.installation_place === 'заглублённая';
    const isShorePns = input.purpose === 'береговая-ПНС';

    // ШУ: серия ШУФ (прямой) / ШУФС (плавный) бренда «Шторм».
    if (input.purpose !== 'береговая-ПНС') {
      const startType = input.start_type;
      const seriesPrefix = startType === 'плавный' || startType === 'частотный' ? 'ШУФС' : 'ШУФ';
      const n = pumpCount(scheme);
      // третья цифра кода серии = число насосов: 223→1-2, 323→3, 423→4
      const seriesNum = n <= 2 ? '223' : n === 3 ? '323' : '423';
      const options: string[] = [];
      if (input.power_supply?.avr || input.power_supply?.inputs === 2) options.push('АВР');
      if (input.jockey_required) {
        const jHp = '';
        options.push(`Жн${jHp}`);
      }
      if (isUnderground) options.push('УХЛ1');
      else options.push('УХЛ4');
      eq.control_cabinet = {
        brand: 'Шторм',
        series: `${seriesPrefix}-${seriesNum}`,
        rated_power: motorKw != null ? measured(motorKw, 'кВт', 'calculated') : undefined,
        options,
      };
    } else {
      // береговая ПНС — серия ШУС
      eq.control_cabinet = {
        brand: 'Шторм',
        series: 'ШУС',
        rated_power: motorKw != null ? measured(motorKw, 'кВт', 'calculated') : undefined,
        options: isUnderground ? ['УХЛ1'] : ['УХЛ4'],
      };
    }

    // Материал коллектора: Ст.20 по умолчанию; нержавейка при подземном.
    if (eq.collector) {
      eq.collector.material = isUnderground ? 'нержавеющая-сталь' : 'углеродистая-сталь';
      eq.collector.pipe_spec = isUnderground
        ? 'нержавеющая сталь AISI 304'
        : 'углеродистая сталь Ст.20 (ГОСТ 10704-91)';
    }

    // Спец-оборудование пожарного типа.
    const extra = [...(eq.extra ?? [])];

    // Воздушная спринклерно-дренчерная АУПТ → компрессор (опция 08).
    if (
      input.purpose === 'АУПТ' &&
      input.special_requirements?.some((s) => /воздушн|дренчер/i.test(s))
    ) {
      eq.compressor = 'Узел подачи воздуха (компрессор) для воздушной АУПТ';
    }

    // Наружное ПТ → патрубки DN80 для МПТ (СП 10.13130 п.12.17).
    if (input.purpose === 'наружное-ПТ') {
      extra.push({
        name: 'Патрубки DN80 для подключения МПТ',
        spec: '≥2 шт. с соединительными головками (СП 10.13130)',
      });
    }

    // Береговая ПНС → самовсасывающий + вакуумный насос, донный клапан.
    if (isShorePns) {
      eq.vacuum_pump = 'Водокольцевой вакуумный насос (самовсасывающая береговая ПНС)';
      extra.push({
        name: 'Донный клапан с сеткой + заборный рукав',
        spec: 'забор воды из открытого водоёма',
      });
    }

    // Подземное исполнение → дренажный насос + датчики уровня (правило 8.2).
    if (isUnderground && !eq.drainage_pump) {
      eq.drainage_pump = 'Дренажный насос CNP SDS MF (приямок подземной станции)';
    }

    if (extra.length > 0) eq.extra = extra;
    return eq;
  },

  // ─── Раздел 6 — Особенности оформления ────────────────────────────────
  documentSpec(): { sections: string[] } {
    return {
      sections: [
        'Характеристики станции',
        'Комплектация',
        'Пожарная гидравлическая схема (реле сухого хода, пусковые реле, манометры)',
        'Габаритный чертёж',
        'Техлист на насос',
        'Маркировка изделия',
      ],
    };
  },

  codeSegments(station: Station, variant: Variant): NonNullable<Output['code_segments']> {
    const { input } = station;
    const scheme = variant.reservation_scheme ?? input.reservation_scheme;
    const regulation = regulationCode(input.start_type ?? null);

    const options: string[] = [];
    // 02 АВР
    if (input.power_supply?.avr || input.power_supply?.inputs === 2) options.push('02');
    // 03 защита от сухого хода — стандартно для пожарных
    options.push('03');
    // 04 выносной ШУ — при подземном исполнении
    if (
      input.station_enclosure === 'подземное-стеклопластик' ||
      input.station_enclosure === 'стеклопластиковый-колодец'
    ) {
      options.push('04');
    }
    // 06 электрозадвижка
    if (variant.equipment?.valves?.electric_valve) options.push('06');
    // 07 жокей-насос
    if (input.jockey_required) options.push('07');
    // 08 прочее — компрессор / вакуумный насос
    if (variant.equipment?.compressor || variant.equipment?.vacuum_pump) options.push('08');

    void workingCount; // схема используется как строка целиком

    return {
      series: 'GF',
      purpose_letter: 'П',
      scheme,
      regulation,
      options,
      collector_code: variant.equipment?.collector?.code,
    };
  },
};
