/**
 * Гидравлические расчёты для напорного трубопровода.
 * Формулы: Дарси-Вейсбах + Альтшуль (упрощённо).
 */

const g = 9.81;

export function pipeArea(diameterMm: number): number {
  const d = diameterMm / 1000;
  return (Math.PI * d * d) / 4;
}

/** Скорость потока v = Q/A, м/с. Q в м³/ч. */
export function flowVelocity(Q_m3h: number, diameterMm: number): number {
  const Q = Q_m3h / 3600;
  return Q / pipeArea(diameterMm);
}

/** Число Рейнольдса. ν воды ≈ 1.31·10⁻⁶ м²/с при +10°C. */
export function reynolds(v_ms: number, diameterMm: number, nu: number = 1.31e-6): number {
  return (v_ms * diameterMm / 1000) / nu;
}

/** Коэффициент трения Альтшуля (универсальная зона). */
export function frictionFactor(Re: number, roughnessMm = 0.5, diameterMm = 100): number {
  if (Re < 2300) return 64 / Math.max(Re, 1);
  const ε = roughnessMm / diameterMm;
  // Формула Альтшуля
  return 0.11 * Math.pow(ε + 68 / Re, 0.25);
}

/** Потери напора по длине, м. */
export function headLossLinear(
  Q_m3h: number,
  diameterMm: number,
  lengthM: number,
  roughnessMm = 0.5
): number {
  const v = flowVelocity(Q_m3h, diameterMm);
  const Re = reynolds(v, diameterMm);
  const lambda = frictionFactor(Re, roughnessMm, diameterMm);
  return (lambda * lengthM / (diameterMm / 1000)) * (v * v) / (2 * g);
}

/** Потери местные: Σζ · v²/(2g). */
export function headLossLocal(Q_m3h: number, diameterMm: number, zetaSum: number): number {
  const v = flowVelocity(Q_m3h, diameterMm);
  return zetaSum * (v * v) / (2 * g);
}

/** Полный потребный напор: геодезический + потери по длине + местные + свободный. */
export function requiredHead(
  geoDelta: number,
  Q_m3h: number,
  diameterMm: number,
  lengthM: number,
  zetaSum: number,
  freeHead: number = 3
): {
  headLossLength: number;
  headLossLocal: number;
  total: number;
  velocity: number;
  reynolds: number;
} {
  const v = flowVelocity(Q_m3h, diameterMm);
  const Re = reynolds(v, diameterMm);
  const headLossLength = headLossLinear(Q_m3h, diameterMm, lengthM);
  const headLossLocalV = headLossLocal(Q_m3h, diameterMm, zetaSum);
  return {
    headLossLength,
    headLossLocal: headLossLocalV,
    total: geoDelta + headLossLength + headLossLocalV + freeHead,
    velocity: v,
    reynolds: Re
  };
}

/** Оценка суммарного коэффициента местных сопротивлений по кол-ву отводов и задвижек. */
export function estimateZetaSum(bendsCount: number, valvesCount: number): number {
  // ζ отвода 90° ≈ 0.5, задвижки полностью открытой ≈ 0.15, обратного клапана ≈ 1.7
  return bendsCount * 0.5 + valvesCount * 0.15 + 1.7; // 1 обратный клапан добавляем по умолчанию
}
