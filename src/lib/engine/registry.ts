/**
 * Реестр модулей типов станций + диспетчер (шаг 1).
 *
 * Диспетчер выбирает модуль с максимальным баллом `matchTriggers`.
 * Сейчас реализован только тип FIRE; реестр расширяем без правки ядра.
 */

import type { StationInput } from '@/lib/dossier/types';
import type { TypeModule } from './types';
import { fireModule } from './types/fire';

/** Все зарегистрированные модули типов. */
export const TYPE_MODULES: TypeModule[] = [fireModule];

/**
 * Диспетчер типа станции — выбирает модуль по входным данным.
 * Возвращает модуль с максимальным баллом соответствия.
 * Если все баллы ≤0 — fallback на первый модуль (FIRE).
 */
export function dispatchType(input: StationInput): TypeModule {
  let best: TypeModule = TYPE_MODULES[0];
  let bestScore = -Infinity;
  for (const m of TYPE_MODULES) {
    const score = m.matchTriggers(input);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Модуль типа по идентификатору. */
export function moduleById(id: string): TypeModule | undefined {
  return TYPE_MODULES.find((m) => m.id === id);
}
