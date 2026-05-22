/**
 * Прогон расчётного движка на фикстуре — проверка Фазы 2.
 *
 * Берёт фикстуру пример-анохин-06.json, оставляет только meta + input
 * (как результат шага 1), прогоняет runStep2..5, печатает наполнение
 * секций calc/variants/output и результат валидации схемы.
 *
 * Запуск: npx tsx scripts/run-engine.ts
 */
import fixture from '../src/lib/dossier/fixtures/пример-анохин-06.json';
import type { Dossier } from '../src/lib/dossier/types';
import { runStep1, runStep2, runStep3, runStep4, runStep5 } from '../src/lib/engine';
import { allGates } from '../src/lib/engine';
import { validateDossier } from '../src/lib/dossier/validate';

// ── Готовим вход: meta + stations[].input (как после шага 1) ─────────────
const raw = fixture as unknown as Dossier;
const input: Dossier = {
  meta: raw.meta,
  stations: raw.stations.map((s) => ({ input: s.input })),
};

console.log('=== ВХОД (meta + input) ===');
console.log('case:', input.meta.case_id, '| сценарий:', input.meta.scenario);
console.log('станций:', input.stations.length);
console.log(
  'станция 0: Q =',
  JSON.stringify(input.stations[0].input.Q),
  'H =',
  JSON.stringify(input.stations[0].input.H),
);

// ── Прогон конвейера ─────────────────────────────────────────────────────
let d = runStep1(input);
d = runStep2(d);
d = runStep3(d);
d = runStep4(d);
d = runStep5(d);

const st = d.stations[0];

console.log('\n=== ШАГ 2 — calc ===');
console.log('Q_target:', JSON.stringify(st.calc?.Q_target));
console.log('H_target:', JSON.stringify(st.calc?.H_target));
console.log('working_point.Q:', JSON.stringify(st.calc?.working_point?.Q));
console.log('working_point.H:', JSON.stringify(st.calc?.working_point?.H));
console.log('fire_reserve_volume:', JSON.stringify(st.calc?.fire_reserve_volume));
console.log('collector_D_suction:', JSON.stringify(st.calc?.collector_D_suction));
console.log('collector_D_discharge:', JSON.stringify(st.calc?.collector_D_discharge));
console.log('jockey_H_calc:', JSON.stringify(st.calc?.jockey_H_calc));
console.log('applicable_norms:', JSON.stringify(st.calc?.applicable_norms));

console.log('\n=== ШАГ 3 — equipment (вариант 0) ===');
const v0 = st.variants?.[0];
console.log('main_pump:', JSON.stringify(v0?.equipment?.main_pump, null, 1));
console.log('jockey_pump:', JSON.stringify(v0?.equipment?.jockey_pump));
console.log('control_cabinet:', JSON.stringify(v0?.equipment?.control_cabinet));
console.log('collector:', JSON.stringify(v0?.equipment?.collector));
console.log('valves:', JSON.stringify(v0?.equipment?.valves));

console.log('\n=== ШАГ 4 — pricing (вариант 0) ===');
console.log('exchange_rate:', v0?.pricing?.exchange_rate);
console.log('rows:', v0?.pricing?.rows?.length);
for (const r of v0?.pricing?.rows ?? []) {
  console.log(
    `  [${r.position_group}] ${r.position_name} — ${r.price} ${r.currency} ×${r.qty} ` +
      `скидка ${r.discount ?? 0}% → ${r.purchase_cost} ₽` +
      (r.price_note ? ` (${r.price_note})` : ''),
  );
}
console.log('total_cost:', v0?.pricing?.total_cost);
console.log('markup_coefficient:', v0?.pricing?.markup_coefficient);
console.log('client_price:', v0?.pricing?.client_price);

console.log('\n=== ШАГ 5 — output ===');
console.log('selected_variant:', st.output?.selected_variant);
console.log('selection_criterion:', st.output?.selection_criterion);
console.log('product_code:', st.output?.product_code);
console.log('code_segments:', JSON.stringify(st.output?.code_segments));
console.log('validation_flags:', JSON.stringify(st.output?.validation_flags));
console.log('documents:', JSON.stringify(st.output?.documents));

console.log('\n=== ГЕЙТЫ ИНЖЕНЕРА ===');
for (const g of allGates(d)) {
  console.log(`Гейт ${g.gate} (станция ${g.stationIndex}): ${g.items.length} пунктов, clear=${g.clear}`);
  for (const it of g.items.slice(0, 5)) {
    console.log(`  - ${it.field}: ${it.issue}${it.current ? ` [${it.current}]` : ''}`);
  }
  if (g.items.length > 5) console.log(`  ... ещё ${g.items.length - 5}`);
}

console.log('\n=== ВАЛИДАЦИЯ СХЕМЫ ===');
const result = validateDossier(d);
console.log('валидно:', result.valid);
if (!result.valid) {
  for (const e of result.errors) console.log('  ошибка:', e);
}

// ── Проверка наполнения секций ───────────────────────────────────────────
console.log('\n=== ИТОГ ПРОВЕРКИ ===');
const checks: Array<[string, boolean]> = [
  ['calc наполнен', st.calc?.Q_target?.value != null && st.calc?.working_point != null],
  ['variants создан', (st.variants?.length ?? 0) > 0],
  ['equipment наполнен', v0?.equipment?.main_pump != null],
  ['pricing наполнен', (v0?.pricing?.rows?.length ?? 0) > 0 && v0?.pricing?.total_cost != null],
  ['output наполнен', st.output?.product_code != null],
  ['дело валидно', result.valid],
];
let allOk = true;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
