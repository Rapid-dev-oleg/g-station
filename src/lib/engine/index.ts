/**
 * Расчётный движок g-station — публичный API (Фаза 2).
 *
 * Код-воплощение скила `pump-station-calc`: конвейер из 5 шагов,
 * 3 гейта инженера, модули типов станций.
 */

export type { TypeModule, MatchScore } from './types';
export type {
  CatalogPort,
  CatalogPortPump,
  CatalogPortCollector,
  CatalogPortPanel,
  CatalogPortWork,
  EngineContext,
} from './catalog-port';
export { TYPE_MODULES, dispatchType, moduleById } from './registry';
export { fireModule } from './types/fire';

export { runStep1, runStep2, runStep3, runStep4, runStep5, runPipeline } from './pipeline';

export type { GateReport, GateItem } from './gates';
export { gate1, gate2, gate3, allGates } from './gates';

// Расчётные хелперы — для UI и тестов.
export * as hydraulics from './calc/hydraulics';
export * as power from './calc/power';
export * as norms from './calc/norms';
export { decideStartType, regulationCode } from './calc/start-type';
