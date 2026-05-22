/**
 * Расчёт мощности насоса и двигателя — KNOWLEDGE/инженерный-расчёт.md §3.
 * P_вал = Q·H/(367·η); P_двиг = k·P_вал; округление вверх по ряду кВт.
 */

/** Стандартный ряд номиналов электродвигателей, кВт (инженерный-расчёт §3.3). */
export const MOTOR_POWER_SERIES = [
  0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160,
  200, 250, 280,
] as const;

/**
 * Мощность на валу насоса.
 * P_вал [кВт] = Q[м³/ч]·H[м] / (367·η) — для воды.
 * @param qM3h расход, м³/ч
 * @param hM напор, м
 * @param efficiency полный КПД насоса (0..1)
 */
export function shaftPower(qM3h: number, hM: number, efficiency: number): number {
  if (efficiency <= 0) return 0;
  return (qM3h * hM) / (367 * efficiency);
}

/**
 * Ориентировочный полный КПД насоса по мощности на валу.
 * Малые 0,4–0,6; средние 0,6–0,75; крупные 0,75–0,85 (§3.2).
 * Используется итеративно: первая оценка с η=0,65, затем уточнение.
 */
export function estimateEfficiency(shaftKwGuess: number): number {
  if (shaftKwGuess < 5) return 0.55;
  if (shaftKwGuess < 50) return 0.68;
  return 0.8;
}

/**
 * Коэффициент запаса мощности двигателя по мощности на валу (§3.3).
 */
export function reserveCoefficient(shaftKw: number): number {
  if (shaftKw < 2) return 1.5;
  if (shaftKw <= 5) return 1.4;
  if (shaftKw <= 50) return 1.2;
  return 1.1;
}

/** Округление вверх до ближайшего стандартного номинала кВт. */
export function roundUpMotorPower(kw: number): number {
  for (const p of MOTOR_POWER_SERIES) {
    if (p >= kw) return p;
  }
  return MOTOR_POWER_SERIES[MOTOR_POWER_SERIES.length - 1];
}

export interface MotorEstimate {
  /** Мощность на валу, кВт. */
  shaftKw: number;
  /** Принятый полный КПД насоса. */
  efficiency: number;
  /** Коэффициент запаса. */
  reserveK: number;
  /** Расчётная мощность двигателя до округления, кВт. */
  motorKwRaw: number;
  /** Номинал двигателя из стандартного ряда, кВт. */
  motorKw: number;
}

/**
 * Полная оценка мощности двигателя по рабочей точке одного насоса.
 * КПД подбирается итеративно (две итерации достаточно для сходимости).
 * @param qM3h расход одного насоса, м³/ч
 * @param hM напор, м
 */
export function estimateMotor(qM3h: number, hM: number): MotorEstimate {
  // первая оценка с η=0,65
  let efficiency = 0.65;
  let shaftKw = shaftPower(qM3h, hM, efficiency);
  // уточнение КПД по полученной мощности
  efficiency = estimateEfficiency(shaftKw);
  shaftKw = shaftPower(qM3h, hM, efficiency);
  const reserveK = reserveCoefficient(shaftKw);
  const motorKwRaw = shaftKw * reserveK;
  const motorKw = roundUpMotorPower(motorKwRaw);
  return { shaftKw, efficiency, reserveK, motorKwRaw, motorKw };
}
