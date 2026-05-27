/**
 * A/B-тест правил коллектора 5.1 v2 + 5.3 v3 (DN).
 *
 * На одном наборе фикстур сравнивает два независимых источника:
 *   A. Код — `resolveCollectorDn` поверх RuleConfig из БД.
 *   B. LLM — Claude через OpenRouter с инструкцией `prompt.md`.
 * И сверяет оба с ожиданием `expected` в `fixtures.json`.
 *
 * Если ключ OpenRouter не задан — LLM пропускается, остаётся только
 * code-vs-expected (для CI/локального прогона без сети).
 *
 * Запуск: npx tsx scripts/ab-rule-collector.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCollectorDn } from '@/lib/engine/calc/collector-dn';
import { loadRules } from '@/server/rules-loader';
import { askAi, getAiConfig } from '@/server/ai';

interface CaseInput {
  qStation: number;
  nozzleDn: number;
  pumpsCount: number;
  underFlood: boolean;
}

interface CaseExpected {
  dischargeDn: number;
  suctionDn: number;
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
  const path = join(process.cwd(), 'tests/ab/rule-collector/fixtures.json');
  return (JSON.parse(readFileSync(path, 'utf-8')) as FixturesFile).cases;
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'tests/ab/rule-collector/prompt.md'), 'utf-8');
}

function parseJsonAnywhere(text: string): CaseExpected {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : text).trim();
  const obj = JSON.parse(body) as CaseExpected;
  return { dischargeDn: obj.dischargeDn, suctionDn: obj.suctionDn };
}

function isMatch(a: CaseExpected, b: CaseExpected): boolean {
  return a.dischargeDn === b.dischargeDn && a.suctionDn === b.suctionDn;
}

function fmt(v: CaseExpected): string {
  return `${v.suctionDn}/${v.dischargeDn}`;
}

async function main(): Promise<void> {
  console.log('=== A/B-тест правил коллектора 5.1 v2 + 5.3 v3 ===\n');

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
    const r = resolveCollectorDn(c.input, rules);
    codeResults.set(c.id, { dischargeDn: r.discharge, suctionDn: r.suction });
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
    console.log('LLM: ключ OpenRouter не задан — пропускаем (только code-vs-expected).\n');
  }

  // Сводка
  const llmEnabled = llmResults.size > 0;
  const header = llmEnabled
    ? `${'кейс'.padEnd(28)}${'ожид.'.padEnd(12)}${'код'.padEnd(12)}код=ожид  ${'LLM'.padEnd(12)}LLM=код`
    : `${'кейс'.padEnd(28)}${'ожид.'.padEnd(12)}${'код'.padEnd(12)}код=ожид`;
  console.log(header);
  console.log('─'.repeat(llmEnabled ? 100 : 70));

  let codePass = 0;
  let llmPass = 0;
  let abMatch = 0;
  for (const c of cases) {
    const code = codeResults.get(c.id)!;
    const codeOk = isMatch(c.expected, code);
    if (codeOk) codePass++;
    let llmCol = '';
    let llmEqCode = '';
    const llm = llmResults.get(c.id);
    if (llm) {
      if ('error' in llm) {
        llmCol = `ERR: ${llm.error}`;
        llmEqCode = '✗';
      } else {
        llmCol = fmt(llm);
        const ok = isMatch(llm, code);
        if (isMatch(c.expected, llm)) llmPass++;
        if (ok) abMatch++;
        llmEqCode = ok ? '✓' : '✗';
      }
    }
    const row = llmEnabled
      ? `${c.id.padEnd(28)}${fmt(c.expected).padEnd(12)}${fmt(code).padEnd(12)}${(codeOk ? '✓' : '✗').padEnd(10)}${llmCol.padEnd(12)}${llmEqCode}`
      : `${c.id.padEnd(28)}${fmt(c.expected).padEnd(12)}${fmt(code).padEnd(12)}${codeOk ? '✓' : '✗'}`;
    console.log(row);
  }

  console.log('\n=== ИТОГ ===');
  console.log(`Код vs ожидание:    ${codePass}/${cases.length}`);
  if (llmEnabled) {
    console.log(`LLM vs ожидание:    ${llmPass}/${cases.length}`);
    console.log(`LLM vs код (A/B):   ${abMatch}/${cases.length}`);
  }
  if (codePass !== cases.length) {
    console.error('\n⚠ Код не совпадает с ожиданием — проверь сидинг RuleConfig или фикстуры.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
