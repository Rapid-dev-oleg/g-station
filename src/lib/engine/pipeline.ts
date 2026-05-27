/**
 * Оркестратор конвейера расчётного движка — 5 шагов.
 *
 * Каждый шаг — чистая функция `(dossier, catalog?) => dossier` (иммутабельность
 * через cloneDossier). Шаги 1, 5 — на уровне станции; 2–4 — цикл по
 * variants[]. Сейчас реализован один тип станции — пожарный (`fireModule`).
 *
 * Каталог опционален: без него движок выдаёт класс/типоразмер и оценочные
 * цены — это «граница автоматизации».
 */

import type { Dossier } from '@/lib/dossier/types';
import { cloneDossier } from '@/lib/dossier/factory';
import type { Catalog } from './catalog';
import { processStation1 } from './steps/step1-input';
import { processStation2 } from './steps/step2-calc';
import { processVariant3 } from './steps/step3-select';
import { processVariant4 } from './steps/step4-pricing';
import { processStation5 } from './steps/step5-output';

/** Шаг 1 — вход + редактирование. Уровень станции. */
export function runStep1(dossier: Dossier): Dossier {
  const next = cloneDossier(dossier);
  for (const station of next.stations) {
    processStation1(station);
  }
  return next;
}

/** Шаг 2 — расчёт + вариативность. Уровень станции (создаёт variants). */
export function runStep2(dossier: Dossier): Dossier {
  const next = cloneDossier(dossier);
  for (const station of next.stations) {
    processStation2(station);
  }
  return next;
}

/** Шаг 3 — подбор оборудования. Цикл по вариантам. */
export function runStep3(dossier: Dossier, catalog?: Catalog): Dossier {
  const next = cloneDossier(dossier);
  for (const station of next.stations) {
    if (!station.variants || station.variants.length === 0) {
      station.variants = [{ name: 'основной', reservation_scheme: station.input.reservation_scheme }];
    }
    for (const variant of station.variants) {
      processVariant3(station, variant, catalog);
    }
  }
  return next;
}

/** Шаг 4 — ценообразование. Цикл по вариантам. */
export function runStep4(dossier: Dossier, catalog?: Catalog): Dossier {
  const next = cloneDossier(dossier);
  for (const station of next.stations) {
    for (const variant of station.variants ?? []) {
      processVariant4(station, variant, catalog);
    }
  }
  return next;
}

/** Шаг 5 — выход. Уровень станции. */
export function runStep5(dossier: Dossier): Dossier {
  const next = cloneDossier(dossier);
  for (const station of next.stations) {
    processStation5(station, next.meta.output_format);
  }
  return next;
}

/** Полный прогон конвейера: шаги 1→5. */
export function runPipeline(dossier: Dossier, catalog?: Catalog): Dossier {
  let d = runStep1(dossier);
  d = runStep2(d);
  d = runStep3(d, catalog);
  d = runStep4(d, catalog);
  d = runStep5(d);
  return d;
}
