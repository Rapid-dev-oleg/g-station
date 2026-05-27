/**
 * Загрузчик правил-конфигов из БД (`RuleConfig`) в форму, понятную движку.
 *
 * Движок чистый TypeScript (без await): здесь правила собираются в плоский
 * объект `Rules` и передаются в `runPipeline(..., catalog, rules)`. Снапшот
 * версии используемых правил кладётся в dossier для воспроизводимости.
 */

import type {
  BrandMapRule,
  CollectorDnByFlowRule,
  CollectorFloorRule,
  MaterialRuleV1,
  PumpClassRule,
  Rules,
} from '@/lib/engine/rules';
import { db } from '@/server/db';

/** Снимок версий правил, использованных в расчёте (для dossier). */
export interface RulesSnapshot {
  /** Версии активных правил: `{ '5.7-material': 'v1', ... }`. */
  versions: Record<string, string>;
}

/** Загружает активные правила из БД, latest version на ruleId. */
export async function loadRules(): Promise<{ rules: Rules; snapshot: RulesSnapshot }> {
  const records = await db.ruleConfig.findMany({
    where: { active: true },
    orderBy: [{ ruleId: 'asc' }, { effectiveFrom: 'desc' }],
  });

  // На каждый ruleId оставляем самую свежую активную запись.
  const latest = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    if (!latest.has(r.ruleId)) latest.set(r.ruleId, r);
  }

  const rules: Rules = {};
  const versions: Record<string, string> = {};

  const material = latest.get('5.7-material');
  if (material) {
    rules.material = material.payload as unknown as MaterialRuleV1;
    versions['5.7-material'] = material.version;
  }

  const dnByFlow = latest.get('5.1-collector-dn-by-flow');
  if (dnByFlow) {
    rules.collectorDnByFlow = dnByFlow.payload as unknown as CollectorDnByFlowRule;
    versions['5.1-collector-dn-by-flow'] = dnByFlow.version;
  }

  const floor = latest.get('5.3-collector-floor');
  if (floor) {
    rules.collectorFloor = floor.payload as unknown as CollectorFloorRule;
    versions['5.3-collector-floor'] = floor.version;
  }

  const pumpClass = latest.get('3.9-A-pump-class');
  if (pumpClass) {
    rules.pumpClass = pumpClass.payload as unknown as PumpClassRule;
    versions['3.9-A-pump-class'] = pumpClass.version;
  }

  const brandMap = latest.get('3.10-brand-map');
  if (brandMap) {
    rules.brandMap = brandMap.payload as unknown as BrandMapRule;
    versions['3.10-brand-map'] = brandMap.version;
  }

  return { rules, snapshot: { versions } };
}
