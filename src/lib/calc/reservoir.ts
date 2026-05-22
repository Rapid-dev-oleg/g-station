/**
 * Расчёт объёма пожарного запаса (СП 10.13130) и приёмной камеры КНС (СП 32.13330).
 */

/** Пожарный запас V = Q · t, м³. Q в м³/ч, t в мин. */
export function fireReserveVolume(Q_m3h: number, workTimeMin: number): number {
  return (Q_m3h * workTimeMin) / 60;
}

/**
 * Объём приёмного резервуара КНС: 5 минут работы насосов при макс. расходе
 * (упрощённая интерпретация СП 32 для регулирующей ёмкости).
 */
export function knsReservoirVolume(Q_m3h: number): number {
  return (Q_m3h * 5) / 60;
}
