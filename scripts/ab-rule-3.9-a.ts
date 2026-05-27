/**
 * A/B-тест правила 3.9-A v2 — матрица класса насоса.
 *
 * На одном наборе фикстур сравнивает два независимых источника:
 *   A. Код — `evalPumpClass` поверх RuleConfig из БД.
 *   B. LLM — Claude через OpenRouter с инструкцией `prompt.md`.
 *
 * Запуск: npx tsx scripts/ab-rule-3.9-a.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalPumpClass, type PumpClassInput } from '@/lib/engine/calc/pump-class';
import type { Footprint, PumpClassCode, Rules } from '@/lib/engine/rules';
import { loadRules } from '@/server/rules-loader';
import { askAi, getAiConfig } from '@/server/ai';

interface CaseInput {
  qPerPump: number;
  hTarget: number;
  footprint: Footprint;
  vertical: boolean;
}

interface CaseExpected {
  classCode: PumpClassCode;
}

interface FixtureCase {
  id: string;
  _description?: string;
  input: CaseInput;
  expected: CaseExpected;
}

interface FixturesFile {
  cases: FixtureCase[];
}

function loadFixtures(): FixtureCase[] {
  const path = join(process.cwd(), 'tests/ab/rule-3.9-a/fixtures.json');
  return (JSON.parse(readFileSync(path, 'utf-8')) as FixturesFile).cases;
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'tests/ab/rule-3.9-a/prompt.md'), 'utf-8');
}

function parseJsonAnywhere(text: string): CaseExpected {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : text).trim();
  const obj = JSON.parse(body) as { classCode: PumpClassCode };
  return { classCode: obj.classCode };
}

/** Конвертирует A/B-вход (footprint/vertical) в форму evalPumpClass. */
function toPumpClassInput(c: CaseInput): PumpClassInput {
  const enclosure =
    c.footprint === 'tight' ? 'подземное-стеклопластик'
    : c.footprint === 'spacious' ? 'технологический-павильон'
    : undefined;
  return {
    qPerPump: c.qPerPump,
    hTarget: c.hTarget,
    stationEnclosure: enclosure,
    installationPlace: undefined,
    required: c.vertical ? ['вертикальные'] : undefined,
  };
}

async function main(): Promise<void> {
  console.log('=== A/B-тест правила 3.9-A v2 — матрица класса насоса ===\n');

  const cases = loadFixtures();
  console.log(`Фикстур: ${cases.length}`);

  const { rules, snapshot } = await loadRules();
  console.log(
    `Правила в БД: ${Object.entries(snapshot.versions)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}\n`,
  );

  // A — код
  const codeResults = new Map<string, CaseExpected>();
  for (const c of cases) {
    const r = evalPumpClass(toPumpClassInput(c.input), rules);
    codeResults.set(c.id, { classCode: r.classCode });
  }

  // B — LLM
  const cfg = await getAiConfig();
  const llmResults = new Map<string, CaseExpected | { error: string }>();
  if (cfg.apiKey) {
    console.log(`LLM: запускаем через ${cfg.model}…\n`);
    const prompt = loadPrompt();
    for (const c of cases) {
      const userPrompt = `Вход:\n\`\`\`json\n${JSON.stringify(c.input, null, 2)}\n\`\`\`\n\nОтветь JSON по формату из инструкции.`;
      try {
        const r = await askAi({ system: prompt, prompt: userPrompt, jsonMode: true });
        llmResults.set(c.id, parseJsonAnywhere(r.content));
      } catch (e) {
        llmResults.set(c.id, { error: (e as Error).message.slice(0, 150) });
      }
    }
  } else {
    console.log('LLM: ключ OpenRouter не задан — пропускаем.\n');
  }

  const llmEnabled = llmResults.size > 0;
  const header = llmEnabled
    ? `${'кейс'.padEnd(36)}${'ожид.'.padEnd(14)}${'код'.padEnd(14)}код=ожид  ${'LLM'.padEnd(14)}LLM=код`
    : `${'кейс'.padEnd(36)}${'ожид.'.padEnd(14)}${'код'.padEnd(14)}код=ожид`;
  console.log(header);
  console.log('─'.repeat(llmEnabled ? 110 : 75));

  let codePass = 0;
  let llmPass = 0;
  let abMatch = 0;
  for (const c of cases) {
    const code = codeResults.get(c.id)!;
    const codeOk = code.classCode === c.expected.classCode;
    if (codeOk) codePass++;
    let llmCol = '';
    let llmEq = '';
    const llm = llmResults.get(c.id);
    if (llm) {
      if ('error' in llm) {
        llmCol = `ERR: ${llm.error}`;
        llmEq = '✗';
      } else {
        llmCol = llm.classCode;
        const ok = llm.classCode === code.classCode;
        if (llm.classCode === c.expected.classCode) llmPass++;
        if (ok) abMatch++;
        llmEq = ok ? '✓' : '✗';
      }
    }
    const row = llmEnabled
      ? `${c.id.padEnd(36)}${c.expected.classCode.padEnd(14)}${code.classCode.padEnd(14)}${(codeOk ? '✓' : '✗').padEnd(10)}${llmCol.padEnd(14)}${llmEq}`
      : `${c.id.padEnd(36)}${c.expected.classCode.padEnd(14)}${code.classCode.padEnd(14)}${codeOk ? '✓' : '✗'}`;
    console.log(row);
  }

  console.log('\n=== ИТОГ ===');
  console.log(`Код vs ожидание:    ${codePass}/${cases.length}`);
  if (llmEnabled) {
    console.log(`LLM vs ожидание:    ${llmPass}/${cases.length}`);
    console.log(`LLM vs код (A/B):   ${abMatch}/${cases.length}`);
  }
  if (codePass !== cases.length) {
    console.error('\n⚠ Код не совпадает с ожиданием — проверь сидинг или фикстуры.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
