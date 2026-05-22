/**
 * Раннер расчётного движка для серверного слоя.
 *
 * Оборачивает чистый движок (`@/lib/engine`) валидацией дела по JSON Schema
 * на входе и на выходе. Каталог передаётся опциональным портом `CatalogPort`
 * (фаза 3); без него движок выдаёт класс/типоразмер и оценочные цены.
 */

import type { Dossier } from '@/lib/dossier/types';
import { validateDossier } from '@/lib/dossier/validate';
import { runPipeline } from '@/lib/engine';
import { allGates, type GateReport } from '@/lib/engine/gates';
import type { CatalogPort } from '@/lib/engine/catalog-port';

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
 * @param dossier      расчётное дело
 * @param catalogPort  опциональная реализация каталога (фаза 3)
 */
export function runCalculation(
  dossier: Dossier,
  catalogPort?: CatalogPort,
): CalculationResult {
  const inputCheck = validateDossier(dossier);
  if (!inputCheck.valid) {
    throw new DossierValidationError('input', inputCheck.errors);
  }

  const result = runPipeline(dossier, { catalog: catalogPort });

  const outputCheck = validateDossier(result);
  if (!outputCheck.valid) {
    throw new DossierValidationError('output', outputCheck.errors);
  }

  return { dossier: result, gates: allGates(result) };
}
