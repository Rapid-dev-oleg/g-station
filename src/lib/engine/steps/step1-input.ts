/**
 * Шаг 1 — Вход + редактирование (на уровне станции).
 *
 * Нормализует единицы, определяет тип станции (диспетчер), при отсутствии
 * Q — выводит расход из параметров здания по нормативным таблицам СП.
 *
 * Чистая функция на уровне станции: правит только `input`.
 */

import type { Station, StationInput } from '@/lib/dossier/types';
import { measured } from '@/lib/dossier/factory';
import { dispatchType } from '../registry';
import { ayptFlowLs } from '../calc/norms';

/** Перевод л/с → м³/ч. */
export const LS_TO_M3H = 3.6;
/** Перевод бар → м вод. ст. */
export const BAR_TO_M = 10;

/** Нормализует единицу расхода к м³/ч. Возвращает значение и пометку. */
function normalizeFlow(m: { value: number | null; unit?: string }): {
  value: number | null;
  note?: string;
} {
  if (m.value == null) return { value: null };
  const unit = (m.unit ?? '').toLowerCase();
  if (unit.includes('л/с') || unit === 'l/s') {
    return { value: m.value * LS_TO_M3H, note: `переведено из ${m.value} л/с (×3,6)` };
  }
  return { value: m.value };
}

/** Нормализует единицу напора/давления к м вод. ст. */
function normalizeHead(m: { value: number | null; unit?: string }): {
  value: number | null;
  note?: string;
} {
  if (m.value == null) return { value: null };
  const unit = (m.unit ?? '').toLowerCase();
  if (unit.includes('бар') || unit === 'bar') {
    return { value: m.value * BAR_TO_M, note: `переведено из ${m.value} бар (×10)` };
  }
  if (unit.includes('мпа') || unit === 'mpa') {
    return { value: m.value * 100, note: `переведено из ${m.value} МПа (×100)` };
  }
  return { value: m.value };
}

/**
 * Выводит расход станции из параметров здания, если Q не задан.
 * @returns расход в м³/ч и пояснение, либо null
 */
function deriveFlow(input: StationInput): { qM3h: number; note: string } | null {
  // ВПВ: Q = число струй × расход струи
  if (input.purpose === 'ВПВ') {
    const streams = input.fire_params?.streams_count;
    const streamFlow = input.fire_params?.stream_flow?.value;
    if (streams != null && streamFlow != null) {
      const qLs = streams * streamFlow;
      return {
        qM3h: qLs * LS_TO_M3H,
        note: `ВПВ (СП 10.13130): ${streams} струи × ${streamFlow} л/с = ${qLs} л/с → ${(qLs * LS_TO_M3H).toFixed(1)} м³/ч`,
      };
    }
  }
  // АУПТ: Q по группе помещений
  if (input.purpose === 'АУПТ') {
    const qLs = ayptFlowLs(1);
    return {
      qM3h: qLs * LS_TO_M3H,
      note: `АУПТ (СП 485, группа 1 — допущение): ${qLs} л/с → ${(qLs * LS_TO_M3H).toFixed(1)} м³/ч`,
    };
  }
  // расход тушения из fire_params
  const fireFlow = input.fire_params?.fire_flow_rate?.value;
  if (fireFlow != null) {
    return {
      qM3h: fireFlow * LS_TO_M3H,
      note: `расход тушения ${fireFlow} л/с → ${(fireFlow * LS_TO_M3H).toFixed(1)} м³/ч`,
    };
  }
  return null;
}

/**
 * Шаг 1 для одной станции. Мутирует переданный (уже клонированный) объект.
 */
export function processStation1(station: Station): void {
  const input = station.input;
  const assumptions = [...(input.assumptions ?? [])];

  // 1. Нормализация единиц Q.
  if (input.Q?.value != null) {
    const norm = normalizeFlow(input.Q);
    if (norm.note) {
      input.Q = measured(
        norm.value,
        'м³/ч',
        input.Q.source === 'extracted' ? 'derived' : input.Q.source,
        norm.note,
      );
    } else if (!input.Q.unit) {
      input.Q.unit = 'м³/ч';
    }
  } else {
    // 2. Вывод Q из параметров здания.
    const derived = deriveFlow(input);
    if (derived) {
      input.Q = measured(derived.qM3h, 'м³/ч', 'derived', derived.note);
      assumptions.push(`Расход Q выведен: ${derived.note}`);
    }
  }

  // 3. Нормализация единиц H.
  if (input.H?.value != null) {
    const norm = normalizeHead(input.H);
    if (norm.note) {
      input.H = measured(
        norm.value,
        'м',
        input.H.source === 'extracted' ? 'derived' : input.H.source,
        norm.note,
      );
    } else if (!input.H.unit) {
      input.H.unit = 'м';
    }
  }

  // 4. Нормализация давления на вводе (бар → м).
  if (input.inlet_pressure?.value != null) {
    const norm = normalizeHead(input.inlet_pressure);
    if (norm.note) {
      input.inlet_pressure = measured(norm.value, 'м', input.inlet_pressure.source, norm.note);
    }
  }

  // 5. Диспетчер типа — фиксируем station_type по триггерам.
  const module = dispatchType(input);
  if (input.station_type !== module.id) {
    assumptions.push(
      `Тип станции переопределён диспетчером: ${input.station_type} → ${module.id} (${module.label})`,
    );
    input.station_type = module.id;
  }

  if (assumptions.length > 0) input.assumptions = assumptions;
}
