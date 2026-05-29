/**
 * ФАЗА 7 — обкатка движка на 44 (фактически 45, два дубля) реальных кейсах.
 *
 * Слепой прогон конвейера: для каждой фикстуры src/lib/dossier/fixtures/cases/*.json
 *  - берётся ТОЛЬКО meta + stations[].input (имитация результата шага 1);
 *  - конвейер runStep1..5 прогоняется НЕ подсматривая в секцию `_expected`;
 *  - рассчитанное сверяется с `_expected` — эталоном «Решение компании».
 *
 * Сверка по параметрам:
 *  - рабочая точка Q, H;
 *  - схема резервирования и число насосов;
 *  - мощность двигателя (±1 ступень стандартного ряда);
 *  - класс/типоразмер насоса (точная модель не сверяется — нет кривых ПО);
 *  - диаметр коллектора всас/напор (±1 типоразмер DN);
 *  - объём резервуара;
 *  - тип пуска;
 *  - структура шифра изделия;
 *  - себестоимость — движок без каталога даёт оценочную цену, поэтому
 *    помечается «оценочно/каталог», не валит прогон.
 *
 * Вывод: полная таблица сравнения + сводка попаданий по параметрам.
 * Запуск: npm run verify
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dossier, Measured, Station } from '../src/lib/dossier/types';
import { runStep1, runStep2, runStep3, runStep4, runStep5 } from '../src/lib/engine';
import { validateDossier } from '../src/lib/dossier/validate';

const CASES_DIR = join(process.cwd(), 'src/lib/dossier/fixtures/cases');

// ── Типоразмерный ряд DN (для допуска ±1 типоразмер) ─────────────────────
const DN_SERIES = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600];

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

/**
 * Парсит класс насоса (3.9-A v2) из шифра + текстового описания эталона.
 * Сначала пытается по подстрокам в шифре (точнее), потом по описанию.
 */
type FactClass = 'SPLIT_CASE' | 'END_SUCTION' | 'MULTISTAGE' | 'IN_LINE';

function parseFactClass(code?: string | null, pumpClass?: string | null): FactClass | null {
  const cd = (code ?? '').toUpperCase();
  // SPLIT_CASE — узнаваемые серии раньше END_SUCTION, чтобы не пересекаться.
  if (/\b(SMM|SMA|SCP|LS-HSC|Д320|D320)/.test(cd)) return 'SPLIT_CASE';
  // MULTISTAGE — все «многоступенчатые» серии (CDM, CHL и т.п.).
  if (/\b(CDM|CDMF|CHL|CHLF|CHLFT|CRV|CR\d|MVL|MVI|MVC|CUC|ECH|CV\d)/.test(cd)) return 'MULTISTAGE';
  // IN_LINE — вертикальный ин-лайн.
  if (/\b(TD|IL|IPN|TP)\d/.test(cd)) return 'IN_LINE';
  // END_SUCTION — горизонтальный одноступенчатый.
  if (/\b(NIS|NES|NM|NBW|NKW|BL|NK|NL)\d/.test(cd)) return 'END_SUCTION';

  // Fallback — по тексту описания.
  const pc = (pumpClass ?? '').toLowerCase();
  if (pc.includes('сплит') || pc.includes('двустор')) return 'SPLIT_CASE';
  if (pc.includes('многоступ')) return 'MULTISTAGE';
  if (pc.includes('вертикальный одноступ') || pc.includes('ин-лайн')) return 'IN_LINE';
  if (pc.includes('одноступенчат') || pc.includes('моноблоч') || pc.includes('end-suction')) {
    return 'END_SUCTION';
  }
  return null;
}

/** Совпадение чисел с относительным допуском. */
function numClose(a: number | null, b: number | null, rel = 0.05): boolean {
  if (a == null || b == null) return a === b;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= rel;
}

// ── Эталонная структура одной станции (раздел `_expected`) ───────────────
interface ExpectedStation {
  Q: number;
  H: number;
  scheme: string;
  pumps?: number;
  motor_kw?: number;
  pump_class?: string;
  collector_suction_dn?: number;
  collector_discharge_dn?: number;
  collector_code?: string;
  reservoir_volume?: number;
  start_type?: string;
  code?: string;
  cost_rub: number | null;
}
interface CaseFixture extends Dossier {
  _expected: { stations: ExpectedStation[]; cost_note?: string };
}

// ── Результат сверки одной станции ───────────────────────────────────────
interface StationCompare {
  caseId: string;
  stationIdx: number;
  // Q
  qCalc: number | null;
  qExp: number;
  qOk: boolean;
  // H
  hCalc: number | null;
  hExp: number;
  hOk: boolean;
  // схема
  schemeCalc: string;
  schemeExp: string;
  schemeOk: boolean;
  // число насосов
  pumpsCalc: number | null;
  pumpsExp: number | null;
  pumpsOk: boolean;
  // мощность
  motorCalc: number | null;
  motorExp: number | null;
  motorOk: boolean | null; // null — нечего сверять
  // коллектор: дельта DN (max всас/напор), в типоразмерах
  collectorDeltaSuc: number | null;
  collectorDeltaDis: number | null;
  collectorOk: boolean | null;
  collectorDnCalc: string;
  collectorDnExp: string;
  // объём резервуара
  reservoirCalc: number | null;
  reservoirExp: number | null;
  reservoirOk: boolean | null;
  // класс насоса (3.9-A / 3.10)
  classCalc: FactClass | null;
  classExp: FactClass | null;
  classOk: boolean | null;
  // тип пуска
  startCalc: string | null;
  startExp: string | null;
  startOk: boolean | null;
  // шифр (структура: серия + схема + регулирование + опции)
  codeCalc: string;
  codeExp: string;
  codeStructOk: boolean;
  // себестоимость
  costCalc: number | null;
  costExp: number | null;
}

/** Структурный разбор шифра: достаём схему и сегмент регулирования. */
function codeParts(code: string): { scheme: string | null; reg: string | null } {
  const schemeM = code.match(/(\d\/\d|\b1\b(?!\d))/);
  const regM = code.match(/-(РПП|РЧП|РК|ПП)\b/);
  return { scheme: schemeM ? schemeM[1] : null, reg: regM ? regM[1] : null };
}

function compareStation(
  calc: Station,
  exp: ExpectedStation,
  caseId: string,
  stationIdx: number,
): StationCompare {
  // Q / H — целевые из calc
  const qCalc = mv(calc.calc?.Q_target);
  const hCalc = mv(calc.calc?.H_target);

  // схема
  const schemeCalc = calc.input.reservation_scheme ?? '1/1';

  // число насосов
  const pumpsCalc = calc.variants?.[0]?.equipment?.main_pump?.qty ?? null;

  // мощность двигателя
  const motorCalc = mv(calc.variants?.[0]?.equipment?.main_pump?.motor_power);

  // коллектор
  const dSucCalc = mv(calc.calc?.collector_D_suction);
  const dDisCalc = mv(calc.calc?.collector_D_discharge);
  let collectorDeltaSuc: number | null = null;
  let collectorDeltaDis: number | null = null;
  if (dSucCalc != null && exp.collector_suction_dn != null) {
    collectorDeltaSuc = Math.abs(dnIndex(dSucCalc) - dnIndex(exp.collector_suction_dn));
  }
  if (dDisCalc != null && exp.collector_discharge_dn != null) {
    collectorDeltaDis = Math.abs(dnIndex(dDisCalc) - dnIndex(exp.collector_discharge_dn));
  }
  let collectorOk: boolean | null = null;
  if (collectorDeltaSuc != null || collectorDeltaDis != null) {
    const maxD = Math.max(collectorDeltaSuc ?? 0, collectorDeltaDis ?? 0);
    collectorOk = maxD <= 1;
  }
  const collectorDnCalc =
    dSucCalc != null || dDisCalc != null
      ? `${dSucCalc ?? '—'}/${dDisCalc ?? '—'}`
      : '—';
  const collectorDnExp =
    exp.collector_suction_dn != null || exp.collector_discharge_dn != null
      ? `${exp.collector_suction_dn ?? '—'}/${exp.collector_discharge_dn ?? '—'}`
      : exp.collector_code ?? '—';

  // резервуар
  const reservoirCalc = mv(calc.calc?.reservoir_volume_rounded);
  const reservoirExp = exp.reservoir_volume ?? null;
  let reservoirOk: boolean | null = null;
  if (reservoirExp != null) {
    reservoirOk = reservoirCalc != null && numClose(reservoirCalc, reservoirExp, 0.05);
  }

  // класс насоса (3.9-A / 3.10)
  const classCalc =
    (calc.variants?.[0]?.equipment?.main_pump?.class_code as FactClass | undefined) ?? null;
  const classExp = parseFactClass(exp.code, exp.pump_class);
  const classOk = classExp == null ? null : classCalc === classExp;

  // тип пуска
  const startCalc = calc.input.start_type ?? null;
  const startExp = exp.start_type ?? null;
  const startOk = startExp == null ? null : startCalc === startExp;

  // шифр
  const codeCalc = calc.output?.product_code ?? '';
  const codeExp = exp.code ?? '';
  const pc = codeParts(codeCalc);
  const pe = codeParts(codeExp);
  const codeStructOk =
    codeExp === '' ||
    ((pc.scheme === pe.scheme || pe.scheme == null) &&
      (pc.reg === pe.reg || pe.reg == null));

  // себестоимость
  const costCalc = calc.variants?.[0]?.pricing?.total_cost ?? null;

  return {
    caseId,
    stationIdx,
    qCalc,
    qExp: exp.Q,
    qOk: numClose(qCalc, exp.Q, 0.05),
    hCalc,
    hExp: exp.H,
    hOk: numClose(hCalc, exp.H, 0.05),
    schemeCalc,
    schemeExp: exp.scheme,
    schemeOk: schemeCalc === exp.scheme,
    pumpsCalc,
    pumpsExp: exp.pumps ?? null,
    pumpsOk: exp.pumps == null ? true : pumpsCalc === exp.pumps,
    motorCalc,
    motorExp: exp.motor_kw ?? null,
    motorOk:
      exp.motor_kw == null
        ? null
        : motorCalc != null && numClose(motorCalc, exp.motor_kw, 0.26),
    collectorDeltaSuc,
    collectorDeltaDis,
    collectorOk,
    collectorDnCalc,
    collectorDnExp,
    reservoirCalc,
    reservoirExp,
    reservoirOk,
    classCalc,
    classExp,
    classOk,
    startCalc,
    startExp,
    startOk,
    codeCalc,
    codeExp,
    codeStructOk,
    costCalc,
    costExp: exp.cost_rub,
  };
}

interface CaseResult {
  file: string;
  caseId: string;
  stations: StationCompare[];
  valid: boolean;
  validErrors: string[];
  skeletonOk: boolean; // Q+H+схема+насосы+мощность+коллектор+пуск
}

function verifyCase(file: string): CaseResult {
  const raw = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')) as CaseFixture;

  // ── Вход: ТОЛЬКО meta + stations[].input ───────────────────────────────
  const input: Dossier = {
    meta: raw.meta,
    stations: raw.stations.map((s) => ({ input: s.input })),
  };

  // ── Слепой прогон конвейера (шаги 1..5) ────────────────────────────────
  let d = runStep1(input);
  d = runStep2(d);
  d = runStep3(d);
  d = runStep4(d);
  d = runStep5(d);

  // ── Сверка по каждой станции ───────────────────────────────────────────
  const stations: StationCompare[] = [];
  for (let i = 0; i < d.stations.length; i++) {
    const exp = raw._expected.stations[i];
    if (!exp) continue;
    stations.push(compareStation(d.stations[i], exp, raw.meta.case_id, i));
  }

  const { valid, errors } = validateDossier(d);

  const skeletonOk = stations.every(
    (s) =>
      s.qOk &&
      s.hOk &&
      s.schemeOk &&
      s.pumpsOk &&
      (s.motorOk ?? true) &&
      (s.collectorOk ?? true) &&
      (s.startOk ?? true) &&
      (s.classOk ?? true),
  );

  return { file, caseId: raw.meta.case_id, stations, valid, validErrors: errors, skeletonOk };
}

// ── Прогон всех кейсов ───────────────────────────────────────────────────
const files = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const results = files.map(verifyCase);

// ── ТАБЛИЦА СРАВНЕНИЯ ────────────────────────────────────────────────────
function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}
function fmtNum(n: number | null): string {
  return n == null ? '—' : String(Math.round(n * 100) / 100);
}
function mark(ok: boolean | null): string {
  if (ok == null) return '·';
  return ok ? '✓' : '✗';
}

console.log('\n=== ОБКАТКА ДВИЖКА g-station: слепой прогон по 44 кейсам ===\n');

const head =
  pad('кейс', 16) +
  pad('Q р/ф', 16) +
  pad('H р/ф', 14) +
  pad('схема р/ф', 13) +
  pad('NкВт р/ф', 14) +
  pad('DN р/ф', 17) +
  pad('пуск р/ф', 19) +
  pad('cost р/ф', 22) +
  'скел';
console.log(head);
console.log('─'.repeat(head.length));

for (const r of results) {
  for (const s of r.stations) {
    const tag = r.stations.length > 1 ? `${r.caseId}#${s.stationIdx + 1}` : r.caseId;
    const skel =
      s.qOk && s.hOk && s.schemeOk && s.pumpsOk && (s.motorOk ?? true) && (s.collectorOk ?? true) && (s.startOk ?? true)
        ? '✓'
        : s.qOk && s.hOk && s.schemeOk
          ? '≈'
          : '✗';
    console.log(
      pad(tag, 16) +
        pad(`${fmtNum(s.qCalc)}/${fmtNum(s.qExp)} ${mark(s.qOk)}`, 16) +
        pad(`${fmtNum(s.hCalc)}/${fmtNum(s.hExp)} ${mark(s.hOk)}`, 14) +
        pad(`${s.schemeCalc}/${s.schemeExp} ${mark(s.schemeOk)}`, 13) +
        pad(`${fmtNum(s.motorCalc)}/${fmtNum(s.motorExp)} ${mark(s.motorOk)}`, 14) +
        pad(`${s.collectorDnCalc}|${s.collectorDnExp} ${mark(s.collectorOk)}`, 17) +
        pad(`${s.startCalc ?? '—'}/${s.startExp ?? '—'} ${mark(s.startOk)}`, 19) +
        pad(`${fmtNum(s.costCalc)}/${fmtNum(s.costExp)}`, 22) +
        skel,
    );
  }
}

// ── СВОДКА ПОПАДАНИЙ ─────────────────────────────────────────────────────
const allStations = results.flatMap((r) => r.stations);
const N = allStations.length;

function pctOf(filter: (s: StationCompare) => boolean, denom: (s: StationCompare) => boolean = () => true) {
  const applicable = allStations.filter(denom);
  const hit = applicable.filter(filter).length;
  return { hit, total: applicable.length, pct: applicable.length ? Math.round((hit / applicable.length) * 100) : 0 };
}

console.log('\n=== СВОДКА: процент попадания по параметрам ===');
console.log(`  всего станций сверено: ${N} (в ${results.length} кейсах)`);
const qS = pctOf((s) => s.qOk);
const hS = pctOf((s) => s.hOk);
const schemeS = pctOf((s) => s.schemeOk);
const pumpsS = pctOf((s) => s.pumpsOk, (s) => s.pumpsExp != null);
const motorS = pctOf((s) => s.motorOk === true, (s) => s.motorOk != null);
const collS = pctOf((s) => s.collectorOk === true, (s) => s.collectorOk != null);
const reservS = pctOf((s) => s.reservoirOk === true, (s) => s.reservoirOk != null);
const classS = pctOf((s) => s.classOk === true, (s) => s.classOk != null);
const startS = pctOf((s) => s.startOk === true, (s) => s.startOk != null);
const codeS = pctOf((s) => s.codeStructOk);
console.log(`  рабочая точка Q:       ${qS.hit}/${qS.total}  (${qS.pct}%)`);
console.log(`  напор H:               ${hS.hit}/${hS.total}  (${hS.pct}%)`);
console.log(`  схема резервирования:  ${schemeS.hit}/${schemeS.total}  (${schemeS.pct}%)`);
console.log(`  число насосов:         ${pumpsS.hit}/${pumpsS.total}  (${pumpsS.pct}%)`);
console.log(`  мощность двигателя:    ${motorS.hit}/${motorS.total}  (${motorS.pct}%)  [±1 ступень]`);
console.log(`  диаметр коллектора:    ${collS.hit}/${collS.total}  (${collS.pct}%)  [±1 типоразмер]`);
console.log(`  объём резервуара:      ${reservS.hit}/${reservS.total}  (${reservS.pct}%)`);
console.log(`  класс насоса (3.9-A):  ${classS.hit}/${classS.total}  (${classS.pct}%)  [SPLIT/END/MULTI/IN-LINE]`);
console.log(`  тип пуска:             ${startS.hit}/${startS.total}  (${startS.pct}%)`);
console.log(`  структура шифра:       ${codeS.hit}/${codeS.total}  (${codeS.pct}%)`);

const skeletonPass = allStations.filter(
  (s) =>
    s.qOk &&
    s.hOk &&
    s.schemeOk &&
    s.pumpsOk &&
    (s.motorOk ?? true) &&
    (s.collectorOk ?? true) &&
    (s.startOk ?? true) &&
    (s.classOk ?? true),
).length;
console.log(`  скелет целиком совпал: ${skeletonPass}/${N}  (${Math.round((skeletonPass / N) * 100)}%)`);

const validPass = results.filter((r) => r.valid).length;
console.log(`  схема дела валидна:    ${validPass}/${results.length}  (${Math.round((validPass / results.length) * 100)}%)`);

console.log('\n  Себестоимость движок без каталога считает ОЦЕНОЧНО (оценочные');
console.log('  цены-ориентиры в step4-pricing) — сверка с эталоном носит');
console.log('  справочный характер, в проценты попадания НЕ включена.');

// ── ДЕТАЛИЗАЦИЯ РАСХОЖДЕНИЙ ──────────────────────────────────────────────
console.log('\n=== РАСХОЖДЕНИЯ (по станциям) ===');
for (const s of allStations) {
  const tag = `${s.caseId}#${s.stationIdx + 1}`;
  const issues: string[] = [];
  if (!s.qOk) issues.push(`Q ${fmtNum(s.qCalc)}≠${fmtNum(s.qExp)}`);
  if (!s.hOk) issues.push(`H ${fmtNum(s.hCalc)}≠${fmtNum(s.hExp)}`);
  if (!s.schemeOk) issues.push(`схема ${s.schemeCalc}≠${s.schemeExp}`);
  if (!s.pumpsOk) issues.push(`насосов ${fmtNum(s.pumpsCalc)}≠${fmtNum(s.pumpsExp)}`);
  if (s.motorOk === false) issues.push(`мощность ${fmtNum(s.motorCalc)}≠${fmtNum(s.motorExp)}`);
  if (s.collectorOk === false)
    issues.push(`коллектор ${s.collectorDnCalc}≠${s.collectorDnExp} (Δвсас=${s.collectorDeltaSuc}, Δнап=${s.collectorDeltaDis})`);
  if (s.reservoirOk === false)
    issues.push(`резервуар ${fmtNum(s.reservoirCalc)}≠${fmtNum(s.reservoirExp)}`);
  if (s.classOk === false) issues.push(`класс ${s.classCalc ?? '—'}≠${s.classExp ?? '—'}`);
  if (s.startOk === false) issues.push(`пуск ${s.startCalc}≠${s.startExp}`);
  if (!s.codeStructOk) issues.push(`шифр-структура «${s.codeCalc}»≠«${s.codeExp}»`);
  if (issues.length > 0) console.log(`  ${pad(tag, 16)} ${issues.join('; ')}`);
}

for (const r of results) {
  if (!r.valid) {
    console.log(`  ! ${r.caseId} — схема невалидна:`);
    for (const e of r.validErrors.slice(0, 4)) console.log(`      ${e}`);
  }
}

console.log('\n=== ИТОГ ===');
console.log(`  кейсов прогнано: ${results.length}; станций сверено: ${N}`);
console.log(`  схема дела валидна на всех результатах: ${validPass === results.length ? 'да' : 'НЕТ'}`);

// Прогон успешен, если конвейер отработал и схема валидна на всех делах.
process.exit(validPass === results.length ? 0 : 1);
