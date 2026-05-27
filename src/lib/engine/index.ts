/**
 * Расчётный движок g-station — публичный API.
 *
 * Код-воплощение скила `pump-station-calc`: конвейер из 5 шагов,
 * 3 гейта инженера, модуль пожарного типа.
 */

export type {
  Catalog,
  CatalogPump,
  CatalogCollector,
  CatalogPanel,
  CatalogWork,
} from './catalog';
export { fireModule } from './types/fire';

export { runStep1, runStep2, runStep3, runStep4, runStep5, runPipeline } from './pipeline';

export type { GateReport, GateItem } from './gates';
export { gate1, gate2, gate3, allGates } from './gates';

// Расчётные хелперы — для UI и тестов.
export * as hydraulics from './calc/hydraulics';
export * as power from './calc/power';
export * as norms from './calc/norms';
export { decideStartType, regulationCode } from './calc/start-type';
