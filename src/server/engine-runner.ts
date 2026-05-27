/**
 * Раннер расчётного движка для серверного слоя.
 *
 * Оборачивает чистый движок (`@/lib/engine`) валидацией дела по JSON Schema
 * на входе и на выходе. Каталог передаётся опциональным объектом `Catalog`;
 * без него движок выдаёт класс/типоразмер и оценочные цены.
 */

import type { Dossier } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { runPipeline } from '@/lib/engine';
import { allGates, type GateReport } from '@/lib/engine/gates';
import type { Catalog } from '@/lib/engine/catalog';
import type { Rules } from '@/lib/engine/rules';
import { createDbCatalogPort } from '@/server/catalog-port';
import { loadRules } from '@/server/rules-loader';

/** Результат прогона расчёта. */
export interface CalculationResult {
  /** Дело после конвейера (валидно по схеме). */
  dossier: Dossier;
  /** Отчёты по трём гейтам инженера. */
  gates: GateReport[];
}

/** Ошибка валидации дела (на входе или выходе движка). */
export class DossierValidationError extends Error {
  constructor(
    public stage: 'input' | 'output',
    public errors: string[],
  ) {
    super(
      `Расчётное дело не прошло валидацию (${stage}):\n` + errors.join('\n'),
    );
    this.name = 'DossierValidationError';
  }
}

/**
 * Прогоняет дело через конвейер движка.
 *
 * 1. Валидирует вход по JSON Schema.
 * 2. Прогоняет `runPipeline` (шаги 1→5).
 * 3. Валидирует выход.
 * 4. Возвращает дело + отчёты по гейтам.
 *
 * @param dossier  расчётное дело
 * @param catalog  опциональная реализация каталога
 * @param rules    опциональный набор правил-конфигов (из БД)
 */
export function runCalculation(
  dossier: Dossier,
  catalog?: Catalog,
  rules?: Rules,
): CalculationResult {
  const inputCheck = validateDossier(dossier);
  if (!inputCheck.valid) {
    throw new DossierValidationError('input', inputCheck.errors);
  }

  const result = runPipeline(dossier, catalog, rules);

  const outputCheck = validateDossier(result);
  if (!outputCheck.valid) {
    throw new DossierValidationError('output', outputCheck.errors);
  }

  return { dossier: result, gates: allGates(result) };
}

/**
 * Прогоняет дело через движок, используя DB-каталог.
 *
 * Загружает реальный каталог из БД (`createDbCatalogPort`) и передаёт его
 * движку — расчёт берёт фактические цены и типоразмеры из прайсов.
 *
 * @param dossier расчётное дело
 */
export async function runCalculationWithDbCatalog(
  dossier: Dossier,
): Promise<CalculationResult> {
  const catalog = await createDbCatalogPort();
  const { rules } = await loadRules();
  return runCalculation(dossier, catalog, rules);
}
