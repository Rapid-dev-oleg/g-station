/**
 * Гидравлический расчёт — формулы из KNOWLEDGE/инженерный-расчёт.md §2, §4.
 * Дарси-Вейсбах, число Рейнольдса, λ (Альтшуль/Блазиус), потери, NPSH.
 *
 * Все функции — чистые. Единицы СИ внутри, кроме явно помеченных.
 */

/** Ускорение свободного падения, м/с². */
export const G = 9.81;

/** Кинематическая вязкость воды при ~10 °C, м²/с. */
export const NU_WATER = 1.3e-6;

/** Атмосферное давление на уровне моря, м вод. ст. */
export const H_ATM = 10.33;

/** Давление насыщенных паров воды при 20 °C, м вод. ст. */
export const H_VAPOR_20C = 0.24;

/**
 * Средняя скорость потока в трубе.
 * @param qM3h расход, м³/ч
 * @param dMm  внутренний диаметр, мм
 * @returns скорость, м/с
 */
export function flowVelocity(qM3h: number, dMm: number): number {
  const d = dMm / 1000; // м
  const area = (Math.PI * d * d) / 4; // м²
  const qM3s = qM3h / 3600;
  return area > 0 ? qM3s / area : 0;
}

/**
 * Число Рейнольдса. Re = V·d/ν.
 * @param vMs скорость, м/с
 * @param dMm диаметр, мм
 */
export function reynolds(vMs: number, dMm: number, nu = NU_WATER): number {
  return (vMs * (dMm / 1000)) / nu;
}

/** Режим течения по числу Рейнольдса. */
export function flowRegime(re: number): 'ламинарный' | 'переходный' | 'турбулентный' {
  if (re < 2300) return 'ламинарный';
  if (re < 4000) return 'переходный';
  return 'турбулентный';
}

/**
 * Коэффициент гидравлического трения λ.
 * Ламинарный — 64/Re; турбулентный — формула Альтшуля
 * λ = 0,11·(ε + 68/Re)^0,25 (переходная зона, общий случай).
 * @param re число Рейнольдса
 * @param dMm диаметр, мм
 * @param kMm абсолютная шероховатость, мм (новая сталь ≈ 0,05–0,1)
 */
export function frictionFactor(re: number, dMm: number, kMm = 0.1): number {
  if (re <= 0) return 0;
  if (re < 2300) return 64 / re;
  const eps = kMm / dMm; // относительная шероховатость
  return 0.11 * Math.pow(eps + 68 / re, 0.25);
}

/**
 * Потери напора по длине (Дарси-Вейсбах).
 * h = λ·(L/d)·V²/(2g).
 * @param lambda коэффициент трения
 * @param lengthM длина участка, м
 * @param dMm диаметр, мм
 * @param vMs скорость, м/с
 * @returns потери, м
 */
export function lengthLoss(lambda: number, lengthM: number, dMm: number, vMs: number): number {
  const d = dMm / 1000;
  if (d <= 0) return 0;
  return lambda * (lengthM / d) * ((vMs * vMs) / (2 * G));
}

/**
 * Потери напора в местном сопротивлении.
 * h = ξ·V²/(2g).
 * @param xiSum сумма коэффициентов местных сопротивлений
 * @param vMs скорость, м/с
 */
export function localLoss(xiSum: number, vMs: number): number {
  return xiSum * ((vMs * vMs) / (2 * G));
}

/** Типовые коэффициенты местных сопротивлений ξ (инженерный-расчёт.md §2.4). */
export const XI = {
  bend90: 0.95,
  gateValveOpen: 0.2,
  discValveOpen: 0.35,
  teeThrough: 0.6,
  teeBranch: 1.15,
  checkValve: 2.0,
  inlet: 0.5,
  outlet: 1.0,
} as const;

/**
 * Оценка суммарных потерь напора в коллекторе станции.
 * Короткие участки — главный вклад дают местные сопротивления.
 * @param qM3h расход, м³/ч
 * @param dMm диаметр коллектора, мм
 * @param lengthM суммарная длина трубопроводов станции, м
 */
export function collectorLosses(qM3h: number, dMm: number, lengthM = 6): number {
  const v = flowVelocity(qM3h, dMm);
  const re = reynolds(v, dMm);
  const lambda = frictionFactor(re, dMm);
  const hLength = lengthLoss(lambda, lengthM, dMm, v);
  // типовой набор арматуры станции: затвор+обратный клапан+2 отвода+тройник
  const xiSum =
    XI.gateValveOpen + XI.checkValve + 2 * XI.bend90 + XI.teeThrough + XI.inlet + XI.outlet;
  const hLocal = localLoss(xiSum, v);
  return hLength + hLocal;
}

export interface NpshResult {
  /** Доступный кавитационный запас (или допустимая высота всасывания), м. */
  npshAvailable: number;
  /** Достаточность относительно NPSHr. */
  margin: number;
  verdict: 'хорошо' | 'минимально-допустимо' | 'недостаточно';
}

/**
 * Доступный NPSHa / проверка кавитации (инженерный-расчёт.md §4).
 * NPSHa = H_атм − H_пар − ΔH_всас − H_запас (относительно уровня воды).
 * @param suctionLossM потери во всасывающем трубопроводе, м
 * @param npshrM требуемый NPSH насоса (из паспорта), м
 * @param reserveM эмпирический запас, м
 */
export function npshCheck(suctionLossM: number, npshrM: number, reserveM = 0.5): NpshResult {
  const npshAvailable = H_ATM - H_VAPOR_20C - suctionLossM - reserveM;
  const margin = npshAvailable - npshrM;
  let verdict: NpshResult['verdict'];
  if (margin > 1.5) verdict = 'хорошо';
  else if (margin >= 1.0) verdict = 'минимально-допустимо';
  else verdict = 'недостаточно';
  return { npshAvailable, margin, verdict };
}
