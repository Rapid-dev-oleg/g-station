/**
 * Выбор способа пуска двигателя — KNOWLEDGE/инженерный-расчёт.md §7.
 *
 * Способ пуска — ЭЛЕКТРОТЕХНИЧЕСКОЕ решение, не функция мощности.
 * Если данных об электроснабжении нет и двигатель ≳22 кВт — на гейт.
 */

import type { PowerSupply, StartType, StationType } from '@/lib/dossier/types';

/** Заводской дефолт CNP (ЩУН): прямой — до 18,5 кВт вкл., плавный — от 22 кВт. */
export const DIRECT_START_POWER_LIMIT = 18.5;

export interface StartTypeDecision {
  /** Рекомендованный тип пуска, либо null если решает инженер. */
  startType: StartType | null;
  /** Обоснование. */
  rationale: string;
  /** true — достоверно не вычисляется, вынести на гейт инженера. */
  toGate: boolean;
}

/**
 * Алгоритм выбора пуска (инженерный-расчёт §7.3).
 * @param stationType тип станции
 * @param motorKw номинал двигателя, кВт
 * @param givenStartType тип пуска из ТЗ/ТУ, если задан
 * @param power данные об электроснабжении
 */
export function decideStartType(
  stationType: StationType,
  motorKw: number,
  givenStartType?: StartType,
  power?: PowerSupply,
): StartTypeDecision {
  // 1. Задан в ТЗ/ТУ — взять как есть.
  if (givenStartType) {
    return {
      startType: givenStartType,
      rationale: 'тип пуска задан ТЗ/ТУ — принят как есть',
      toGate: false,
    };
  }

  // 2. Водоснабжение / повышение давления → частотный (регулирование).
  if (stationType === 'water') {
    return {
      startType: 'частотный',
      rationale: 'водоснабжение/повышение давления — частотное регулирование под переменный расход',
      toGate: false,
    };
  }

  // Признаки слабой сети / питания от ДГУ / ограничения пускового тока.
  const fromGenerator = power?.from_generator === true;
  const startCurrentLimited = Boolean(power?.start_current_limit);
  const hasPowerData = fromGenerator || startCurrentLimited || power?.category !== undefined;

  // 3. Пожарная станция.
  if (fromGenerator || startCurrentLimited) {
    return {
      startType: 'плавный',
      rationale: fromGenerator
        ? 'питание от генератора — плавный пуск снижает требуемую мощность ДГУ'
        : 'ограничение пускового тока по ТУ — требуется плавный пуск',
      toGate: false,
    };
  }

  // 4. Крупный двигатель без данных об электроснабжении — на гейт.
  if (motorKw >= 22 && !hasPowerData) {
    return {
      startType: null,
      rationale:
        `двигатель ${motorKw} кВт — заводской дефолт CNP предлагает плавный пуск, ` +
        'но при отсутствии данных об электроснабжении (ТУ, питание от сети/ДГУ) ' +
        'способ пуска достоверно не вычисляется — решение инженера',
      toGate: true,
    };
  }

  // Двигатель в зоне прямого пуска или есть данные о сети — прямой пуск.
  return {
    startType: 'прямой',
    rationale:
      motorKw <= DIRECT_START_POWER_LIMIT
        ? `двигатель ${motorKw} кВт ≤ ${DIRECT_START_POWER_LIMIT} кВт — прямой пуск (надёжность, заводской дефолт)`
        : 'пожарная станция, нет признаков слабой сети — прямой пуск по умолчанию',
    toGate: false,
  };
}

/** Код регулирования в шифре изделия по типу пуска. */
export function regulationCode(startType: StartType | null): 'ПП' | 'РПП' | 'РЧП' | 'РК' {
  switch (startType) {
    case 'плавный':
      return 'РПП';
    case 'частотный':
      return 'РЧП';
    case 'каскадный':
      return 'РК';
    case 'прямой':
    default:
      return 'ПП';
  }
}
