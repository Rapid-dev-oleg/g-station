/**
 * Декларативные правила расчёта (триггеры/таблицы), которые мы вынесли из
 * TS-кода в JSON-конфиги БД (`Prisma RuleConfig`). Формулы остаются TS-кодом;
 * здесь только условия выбора.
 *
 * Принцип: правило-конфиг описывается типизированной структурой ниже,
 * движок принимает его в `runPipeline(..., rules)` (опционально). Если
 * правило не передано — движок использует встроенный fallback (для тестов
 * `verify-cases` и обратной совместимости).
 */

import type { StationInput } from '@/lib/dossier/types';

// ── Правило 5.7 — материал коллектора ────────────────────────────────────

/** Условие на одно поле — равенство значения. */
export interface ConditionEquals {
  field: string;
  equals: unknown;
}

/** Условие на одно поле — значение в списке. */
export interface ConditionIn {
  field: string;
  in: unknown[];
}

/** Один атомарный предикат. */
export type ConditionLeaf = ConditionEquals | ConditionIn;

/** Композиция предикатов: anyOf — OR; allOf — AND. */
export interface ConditionGroup {
  anyOf?: ConditionLeaf[];
  allOf?: ConditionLeaf[];
}

/** Триггер материала: при срабатывании `when` выдаёт `then`. */
export interface MaterialTrigger {
  /** Идентификатор триггера (для трассировки). */
  id: string;
  /** Условие срабатывания. */
  when: ConditionGroup;
  /** Что присвоить материалу и pipe_spec при срабатывании. */
  then: { material: string; pipeSpec: string };
}

/** Правило 5.7 — материал коллектора (v1, текущая реализация). */
export interface MaterialRuleV1 {
  ruleId: '5.7-material';
  version: string;
  /** Если ни один триггер не сработал — берётся `defaults`. */
  defaults: { material: string; pipeSpec: string };
  /** Триггеры в порядке приоритета: первый сработавший побеждает. */
  triggers: MaterialTrigger[];
}

// ── Правила 5.1 v2 / 5.3 v3 — DN коллектора ─────────────────────────────

/**
 * Правило 5.1 v2 — DN коллектора от расхода станции.
 * Параметризует порог запаса (доля верхней границы диапазона DN), при
 * достижении которой берётся следующий типоразмер. По умолчанию 0.80
 * (СП 31.13330: скорость напор 1,0–2,5 м/с, всас 0,8–1,5 м/с).
 */
export interface CollectorDnByFlowRule {
  ruleId: '5.1-collector-dn-by-flow';
  version: string;
  /** Доля верхней границы диапазона, при которой переходим на следующий DN. */
  reserveThreshold: number;
}

/**
 * Правило 5.3 v3 — floor и запас по составу станции.
 * - floor (+1 типоразмер) только для патрубков ≤ smallNozzleDnMax;
 * - запас (+1 типоразмер) при числе насосов ≥ manyPumpsThreshold.
 */
export interface CollectorFloorRule {
  ruleId: '5.3-collector-floor';
  version: string;
  /** Порог DN патрубка, ниже которого применяется floor. */
  smallNozzleDnMax: number;
  /** Шагов floor для малого патрубка. */
  smallNozzleSteps: number;
  /** Порог числа насосов для запаса. */
  manyPumpsThreshold: number;
  /** Шагов запаса при N ≥ threshold. */
  manyPumpsSteps: number;
}

// ── Все правила, которые движок умеет принимать ──────────────────────────

/** Набор правил, передаваемый в `runPipeline(..., rules)`. */
export interface Rules {
  /** Правило 5.7 — материал коллектора. */
  material?: MaterialRuleV1;
  /** Правило 5.1 v2 — DN коллектора от расхода. */
  collectorDnByFlow?: CollectorDnByFlowRule;
  /** Правило 5.3 v3 — floor по патрубку и запас по числу насосов. */
  collectorFloor?: CollectorFloorRule;
  // Сюда же позже: pumpClass (3.9-A), brandMap (3.10), margin (2.5), markup (B1).
}

// ── Evaluator-ы ──────────────────────────────────────────────────────────

/** Достаёт значение по точечному пути. */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function matchLeaf(leaf: ConditionLeaf, input: StationInput): boolean {
  const value = getByPath(input, leaf.field);
  if ('equals' in leaf) return value === leaf.equals;
  return leaf.in.includes(value as never);
}

function matchGroup(group: ConditionGroup, input: StationInput): boolean {
  if (group.anyOf) {
    return group.anyOf.some((leaf) => matchLeaf(leaf, input));
  }
  if (group.allOf) {
    return group.allOf.every((leaf) => matchLeaf(leaf, input));
  }
  return false;
}

/**
 * Применяет правило 5.7 — материал коллектора.
 * Первый сработавший триггер выигрывает; иначе — defaults.
 */
export function evalMaterial(
  rule: MaterialRuleV1,
  input: StationInput,
): { material: string; pipeSpec: string; ruleVersion: string; triggerId: string | null } {
  for (const trigger of rule.triggers) {
    if (matchGroup(trigger.when, input)) {
      return {
        material: trigger.then.material,
        pipeSpec: trigger.then.pipeSpec,
        ruleVersion: rule.version,
        triggerId: trigger.id,
      };
    }
  }
  return {
    material: rule.defaults.material,
    pipeSpec: rule.defaults.pipeSpec,
    ruleVersion: rule.version,
    triggerId: null,
  };
}
