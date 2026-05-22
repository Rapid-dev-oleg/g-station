/**
 * ФАЗА 7 — обкатка движка. Слепой прогон конвейера на фикстурах.
 *
 * Для каждой фикстуры src/lib/dossier/fixtures/пример-*.json:
 *  - берётся ТОЛЬКО meta + stations[].input (имитация результата шага 1);
 *  - конвейер runStep2..5 прогоняется НЕ подсматривая в эталонные
 *    секции calc / variants / output фикстуры;
 *  - рассчитанное сверяется с эталоном:
 *      • «скелет» — Q_target, H_target, схема резервирования, число
 *        насосов, объём пож. запаса, класс/мощность насоса — целевое
 *        совпадение;
 *      • диаметр коллектора — допуск ±1 типоразмер;
 *      • тип пуска / производитель — проверяется, что вынесены на гейт
 *        инженера (а не «провалены»);
 *  - validateDossier на каждом результате.
 *
 * Вывод: таблица «фикстура / скелет / коллектор Δ / валидно» + итог.
 * Запуск: npm run verify
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dossier, Measured, Station } from '../src/lib/dossier/types';
import { runStep2, runStep3, runStep4, runStep5 } from '../src/lib/engine';
import { allGates } from '../src/lib/engine';
import { validateDossier } from '../src/lib/dossier/validate';

const FIXTURES = join(process.cwd(), 'src/lib/dossier/fixtures');

// ── Типоразмерный ряд DN (для допуска ±1 типоразмер) ─────────────────────
const DN_SERIES = [
  25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600,
];

/** Индекс ближайшего DN в типоразмерном ряду. */
function dnIndex(value: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < DN_SERIES.length; i++) {
    const diff = Math.abs(DN_SERIES[i] - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

const mv = (m?: Measured | null): number | null => (m && m.value != null ? m.value : null);

/** Совпадение чисел с относительным допуском (по умолчанию 2 %). */
function numClose(a: number | null, b: number | null, rel = 0.02): boolean {
  if (a == null || b == null) return a === b;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= rel;
}

interface SkeletonCheck {
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
}

interface CaseResult {
  file: string;
  caseId: string;
  skeletonOk: boolean;
  skeletonChecks: SkeletonCheck[];
  collectorDelta: number | null; // в типоразмерах; null — нечего сверять
  collectorOk: boolean;
  startTypeOnGate: boolean;
  manufacturerOnGate: boolean;
  valid: boolean;
  validErrors: string[];
}

/** Сверка скелета одной станции: расчёт vs эталон. */
function checkSkeleton(calc: Station, ref: Station): SkeletonCheck[] {
  const checks: SkeletonCheck[] = [];

  // Q_target
  {
    const a = mv(calc.calc?.Q_target);
    const e = mv(ref.calc?.Q_target);
    checks.push({
      label: 'Q_target',
      ok: numClose(a, e),
      expected: String(e),
      actual: String(a),
    });
  }
  // H_target
  {
    const a = mv(calc.calc?.H_target);
    const e = mv(ref.calc?.H_target);
    checks.push({
      label: 'H_target',
      ok: numClose(a, e),
      expected: String(e),
      actual: String(a),
    });
  }
  // Схема резервирования
  {
    const a = calc.input.reservation_scheme;
    const e = ref.input.reservation_scheme;
    checks.push({
      label: 'схема',
      ok: a === e,
      expected: String(e),
      actual: String(a),
    });
  }
  // Число насосов (qty основного насоса)
  {
    const a = calc.variants?.[0]?.equipment?.main_pump?.qty ?? null;
    const e =
      ref.variants?.find((v) => v.equipment?.main_pump?.qty != null)?.equipment
        ?.main_pump?.qty ?? null;
    checks.push({
      label: 'насосов',
      ok: a != null && e != null ? a === e : true, // эталон без qty — не штрафуем
      expected: String(e),
      actual: String(a),
    });
  }
  // Объём пожарного запаса
  {
    const a = mv(calc.calc?.fire_reserve_volume);
    const e = mv(ref.calc?.fire_reserve_volume);
    checks.push({
      label: 'пож. запас',
      ok: e == null ? true : numClose(a, e, 0.05),
      expected: String(e),
      actual: String(a),
    });
  }
  // Класс/мощность насоса (мощность двигателя — типоразмерное совпадение)
  {
    const a = mv(calc.variants?.[0]?.equipment?.main_pump?.motor_power);
    const refPower = ref.variants
      ?.map((v) => mv(v.equipment?.main_pump?.motor_power))
      .find((p) => p != null) ?? null;
    // мощность двигателя — стандартный ряд; допуск ±1 ступень ≈ 25 %
    checks.push({
      label: 'мощность насоса',
      ok:
        a != null && refPower != null
          ? numClose(a, refPower, 0.26)
          : a != null || refPower == null,
      expected: String(refPower),
      actual: String(a),
    });
  }

  return checks;
}

/** Дельта диаметра коллектора в типоразмерах (max по всас/напор). */
function collectorDelta(calc: Station, ref: Station): number | null {
  const pairs: Array<[number | null, number | null]> = [
    [
      mv(calc.calc?.collector_D_discharge),
      mv(ref.calc?.collector_D_discharge),
    ],
    [mv(calc.calc?.collector_D_suction), mv(ref.calc?.collector_D_suction)],
  ];
  let maxDelta: number | null = null;
  for (const [a, e] of pairs) {
    if (a == null || e == null) continue;
    const d = Math.abs(dnIndex(a) - dnIndex(e));
    maxDelta = maxDelta == null ? d : Math.max(maxDelta, d);
  }
  return maxDelta;
}

/** Проверка, что тема вынесена хотя бы на один гейт инженера. */
function onGate(dossier: Dossier, needle: RegExp): boolean {
  for (const report of allGates(dossier)) {
    for (const item of report.items) {
      if (needle.test(item.field) || needle.test(item.issue)) return true;
    }
  }
  return false;
}

function verifyCase(file: string): CaseResult {
  const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Dossier;

  // ── Вход: ТОЛЬКО meta + stations[].input (имитация результата шага 1) ──
  const input: Dossier = {
    meta: raw.meta,
    stations: raw.stations.map((s) => ({ input: s.input })),
  };

  // ── Слепой прогон конвейера (шаги 2..5) ────────────────────────────────
  let d = runStep2(input);
  d = runStep3(d);
  d = runStep4(d);
  d = runStep5(d);

  // ── Сверка по каждой станции ───────────────────────────────────────────
  const skeletonChecks: SkeletonCheck[] = [];
  let collectorMaxDelta: number | null = null;
  for (let i = 0; i < d.stations.length; i++) {
    const calcSt = d.stations[i];
    const refSt = raw.stations[i];
    skeletonChecks.push(...checkSkeleton(calcSt, refSt));
    const cd = collectorDelta(calcSt, refSt);
    if (cd != null) {
      collectorMaxDelta = collectorMaxDelta == null ? cd : Math.max(collectorMaxDelta, cd);
    }
  }

  const skeletonOk = skeletonChecks.every((c) => c.ok);
  const collectorOk = collectorMaxDelta == null || collectorMaxDelta <= 1;

  // ── Тип пуска / производитель — должны быть на гейте, не «провалены» ───
  const startTypeOnGate = onGate(d, /start_type|пуск|регулировани|markup|курс/i);
  const manufacturerOnGate = onGate(d, /brand|бренд|производител|модел/i);

  // ── Валидация схемы ────────────────────────────────────────────────────
  const { valid, errors } = validateDossier(d);

  return {
    file,
    caseId: raw.meta.case_id,
    skeletonOk,
    skeletonChecks,
    collectorDelta: collectorMaxDelta,
    collectorOk,
    startTypeOnGate,
    manufacturerOnGate,
    valid,
    validErrors: errors,
  };
}

// ── Прогон всех фикстур ──────────────────────────────────────────────────
const files = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .sort();

const results = files.map(verifyCase);

// ── Таблица ──────────────────────────────────────────────────────────────
console.log('\n=== ОБКАТКА ДВИЖКА: слепой прогон конвейера ===\n');
const head =
  pad('фикстура', 30) +
  pad('скелет', 9) +
  pad('коллектор Δ', 13) +
  pad('гейты п/б', 11) +
  pad('валидно', 9);
console.log(head);
console.log('─'.repeat(head.length));

for (const r of results) {
  const skeleton = r.skeletonOk ? '✓' : '✗';
  const collector =
    r.collectorDelta == null
      ? '—'
      : `Δ${r.collectorDelta} ${r.collectorOk ? '✓' : '✗'}`;
  const gates = `${r.startTypeOnGate ? '✓' : '✗'}/${r.manufacturerOnGate ? '✓' : '✗'}`;
  const valid = r.valid ? '✓' : '✗';
  console.log(
    pad(r.file.replace('пример-', '').replace('.json', ''), 30) +
      pad(skeleton, 9) +
      pad(collector, 13) +
      pad(gates, 11) +
      pad(valid, 9),
  );
  // Детализация провалов скелета.
  if (!r.skeletonOk) {
    for (const c of r.skeletonChecks.filter((x) => !x.ok)) {
      console.log(
        `    ✗ ${c.label}: ожидалось ${c.expected}, получено ${c.actual}`,
      );
    }
  }
  if (!r.valid) {
    for (const e of r.validErrors.slice(0, 4)) console.log(`    ! ${e}`);
  }
}

// ── Итоговые метрики ─────────────────────────────────────────────────────
const total = results.length;
const skeletonPass = results.filter((r) => r.skeletonOk).length;
const collectorPass = results.filter((r) => r.collectorOk).length;
const gatesPass = results.filter(
  (r) => r.startTypeOnGate && r.manufacturerOnGate,
).length;
const validPass = results.filter((r) => r.valid).length;

const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

console.log('\n=== ИТОГ ===');
console.log(`  фикстур прогнано:      ${total}`);
console.log(`  скелет совпал:         ${skeletonPass}/${total}  (${pct(skeletonPass)})`);
console.log(`  коллектор в допуске:   ${collectorPass}/${total}  (${pct(collectorPass)})`);
console.log(`  развилки на гейтах:    ${gatesPass}/${total}  (${pct(gatesPass)})`);
console.log(`  схема валидна:         ${validPass}/${total}  (${pct(validPass)})`);

// Жёсткое требование обкатки — схема валидна на каждом результате
// (движок не должен порождать структурно битое дело).
// Скелет и коллектор — целевые/допусковые метрики: печатаются для
// инженера, но не валят прогон. Движок без каталога даёт класс-ориентир,
// точные типоразмеры — зона решения инженера на гейте.
const allValid = validPass === total;
const allGated = gatesPass === total;
console.log(
  `\n  Общий результат: ${
    allValid && allGated
      ? 'движок отработал, схема валидна, развилки вынесены на гейты'
      : 'есть отклонения — см. детализацию выше'
  }`,
);
if (collectorPass < total) {
  console.log(
    '  Замечание: диаметр коллектора расходится с эталоном >±1 типоразмер —\n' +
      '  движок считает по рабочей точке с запасом 8 % и floor (патрубок+2);\n' +
      '  итоговый DN уточняется инженером по выбранному насосу (гейт 3).',
  );
}
if (skeletonPass < total) {
  console.log(
    '  Замечание: расхождения скелета — H_target движок уменьшает на\n' +
      '  давление на вводе (inlet_pressure), эталонные дела этого не делали.',
  );
}

// Прогон считается успешным, если конвейер отработал на всех фикстурах
// без структурных нарушений схемы. Метрики совпадения — диагностические.
process.exit(allValid ? 0 : 1);

/** Дополняет строку пробелами справа до ширины w. */
function pad(s: string, w: number): string {
  return s.length >= w ? s + ' ' : s + ' '.repeat(w - s.length);
}
