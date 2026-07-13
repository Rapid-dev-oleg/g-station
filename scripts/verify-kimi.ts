/**
 * Эталон качества боевого расчёта (LLM-путь) — замена удалённого `npm run verify`.
 *
 * По каждому кейсу-фикстуре: берём карточку (meta + input), прогоняем ФАЗУ 1
 * скила pump-station-calc через того же агента, что и прод (kimi/claude), и
 * сверяем ключевые характеристики с `_expected`. Веб-подбор цен (этап C) НЕ
 * запускаем — меряем только «скелет» расчёта (схема, число насосов, мощность,
 * DN коллектора, класс насоса, шифр), как старый движок-стенд.
 *
 * Запуск:  npx tsx scripts/verify-kimi.ts [N|caseId ...]
 *   без аргументов — все кейсы; число N — первые N; список id — только их.
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runKimiAgent } from '../src/server/ai/kimi-agent';

const CASES_DIR = join(process.cwd(), 'src/lib/dossier/fixtures/cases');

interface ExpectedStation {
  Q?: number; H?: number; scheme?: string; pumps?: number; motor_kw?: number;
  pump_class?: string; collector_suction_dn?: number; collector_discharge_dn?: number;
  reservoir_volume?: number; start_type?: string; code?: string;
}
interface CaseFile {
  meta?: unknown;
  stations: { input: Record<string, unknown> }[];
  _expected?: { stations?: ExpectedStation[] };
}
interface CalcItem { param: string; value: string }

const PHASE1_PROMPT = (card: unknown): string =>
  'Выполни ШАГИ 1-3 скила pump-station-calc для этой станции: определи тип, ' +
  'посчитай рабочую точку и характеристики (шаг 2), подбери состав оборудования ' +
  '(шаг 3). НЕ ищи в интернете, НЕ выбирай бренд/производителя/точную модель.\n\n' +
  'Верни СТРОГО JSON-блоком:\n```json\n' +
  '{"items":[{"param":"<характеристика>","value":"<значение>","rationale":"<норматив>","gate":false}],' +
  '"code":"<шифр изделия по nomenclature.md>"}\n```\n\n' +
  'В items обязательно включи: схему резервирования, число насосов, мощность ' +
  'двигателя (кВт), DN коллектора (всас и напор), класс/конструктив насоса, ' +
  'тип пуска, объём резервуаров.\n\nКарточка:\n' + JSON.stringify(card, null, 2);

/** Первый ```json блок или первый {...} из ответа агента. */
function extractJson(out: string): { items?: CalcItem[]; code?: string } | null {
  const fence = out.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  try { return JSON.parse(raw.trim()); } catch { return null; }
}

const firstNum = (s: string): number | null => {
  const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const itemsFind = (items: CalcItem[], re: RegExp): string | null =>
  items.find((it) => re.test(it.param))?.value ?? null;

/** Метрики одного кейса: поле → hit | miss | n/a (нет эталона). */
type Verdict = 'hit' | 'miss' | 'n/a';
function score(exp: ExpectedStation, items: CalcItem[], code?: string): Record<string, Verdict> {
  const num = (re: RegExp) => { const v = itemsFind(items, re); return v == null ? null : firstNum(v); };
  const str = (re: RegExp) => itemsFind(items, re);
  const near = (a: number | null, b: number | undefined, tol = 0) =>
    a == null || b == null ? 'n/a' as Verdict : (Math.abs(a - b) <= tol ? 'hit' : 'miss');
  const has = (a: string | null, b: string | undefined) =>
    a == null || b == null ? 'n/a' as Verdict
      : (a.toLowerCase().includes(String(b).toLowerCase().split(/[\s(]/)[0]) ? 'hit' : 'miss');

  const dnAll = items.filter((it) => /коллектор|dn|ду\b/i.test(it.param)).map((it) => it.value).join(' ');
  const dnNums = (dnAll.match(/\d+/g) || []).map(Number);
  const dnHit = (exp.collector_suction_dn && dnNums.includes(exp.collector_suction_dn)) ||
                (exp.collector_discharge_dn && dnNums.includes(exp.collector_discharge_dn));

  return {
    scheme: has(str(/схем|резерв/i), exp.scheme),
    pumps: near(num(/число насос|кол.*насос|рабоч.*резерв|насосов/i), exp.pumps),
    motor_kw: near(num(/мотор|мощнос|двигат|квт/i), exp.motor_kw, 0),
    dn: exp.collector_suction_dn == null ? 'n/a' : (dnNums.length === 0 ? 'n/a' : (dnHit ? 'hit' : 'miss')),
    pump_class: has(str(/класс|конструктив|тип.*насос|насос.*тип/i), exp.pump_class),
    start_type: has(str(/пуск/i), exp.start_type),
    code: exp.code == null ? 'n/a' : (code && code.trim() === exp.code.trim() ? 'hit' : 'miss'),
  };
}

async function main(): Promise<void> {
  process.env.KIMI_AGENT_WORKSPACE ||= '/home/oblacko/Projects/gidrostroy';
  const args = process.argv.slice(2);
  let files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).sort();
  if (args.length === 1 && /^\d+$/.test(args[0])) files = files.slice(0, parseInt(args[0], 10));
  else if (args.length) files = args.map((a) => (a.endsWith('.json') ? a : a + '.json'));

  console.log(`Эталон Kimi-расчёта · кейсов: ${files.length} · агент: ${process.env.CALC_AGENT || 'kimi'}\n`);
  const FIELDS = ['scheme', 'pumps', 'motor_kw', 'dn', 'pump_class', 'start_type', 'code'] as const;
  const tally: Record<string, { hit: number; miss: number; na: number }> =
    Object.fromEntries(FIELDS.map((f) => [f, { hit: 0, miss: 0, na: 0 }]));

  for (const file of files) {
    const c = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf-8')) as CaseFile;
    const exp = c._expected?.stations?.[0];
    if (!exp) { console.log(`— ${file}: нет _expected, пропуск`); continue; }
    const card = { meta: c.meta, input: c.stations?.[0]?.input };
    const t0 = Date.now();
    try {
      const { output } = await runKimiAgent({ skill: 'pump-station-calc', prompt: PHASE1_PROMPT(card), timeoutMs: 8 * 60 * 1000 });
      const parsed = extractJson(output);
      const items = parsed?.items ?? [];
      const verdicts = score(exp, items, parsed?.code);
      const row = FIELDS.map((f) => {
        const v = verdicts[f];
        if (v === 'hit') tally[f].hit++; else if (v === 'miss') tally[f].miss++; else tally[f].na++;
        return `${f}:${v === 'hit' ? '✓' : v === 'miss' ? '✗' : '·'}`;
      }).join('  ');
      console.log(`✔ ${file.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${row}`);
    } catch (e) {
      console.log(`✖ ${file.padEnd(20)} ошибка: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n─── ИТОГ (hit / из оценённых) ───');
  for (const f of FIELDS) {
    const t = tally[f]; const den = t.hit + t.miss;
    const pct = den ? Math.round((100 * t.hit) / den) : 0;
    console.log(`  ${f.padEnd(12)} ${den ? `${pct}%`.padStart(4) : '  —'}  (${t.hit}/${den}${t.na ? `, n/a ${t.na}` : ''})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
