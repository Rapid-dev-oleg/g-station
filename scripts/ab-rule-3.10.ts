/**
 * A/B-тест правила 3.10 — карта аналогов брендов.
 *
 * Запуск: npx tsx scripts/ab-rule-3.10.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalBrandMap } from '@/lib/engine/calc/brand-map';
import type { PumpClassCode } from '@/lib/engine/rules';
import { loadRules } from '@/server/rules-loader';
import { askAi, getAiConfig } from '@/server/ai';

interface CaseInput {
  reference: string;
}

interface CaseExpected {
  classCode: PumpClassCode | null;
  cnpSeries: string | null;
}

interface FixtureCase {
  id: string;
  input: CaseInput;
  expected: CaseExpected;
}

interface FixturesFile {
  cases: FixtureCase[];
}

function loadFixtures(): FixtureCase[] {
  const path = join(process.cwd(), 'tests/ab/rule-3.10/fixtures.json');
  return (JSON.parse(readFileSync(path, 'utf-8')) as FixturesFile).cases;
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'tests/ab/rule-3.10/prompt.md'), 'utf-8');
}

function parseJsonAnywhere(text: string): CaseExpected {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : text).trim();
  const obj = JSON.parse(body) as { classCode: PumpClassCode | null; cnpSeries: string | null };
  return { classCode: obj.classCode, cnpSeries: obj.cnpSeries };
}

function eq(a: CaseExpected, b: CaseExpected): boolean {
  return a.classCode === b.classCode && a.cnpSeries === b.cnpSeries;
}

function fmt(v: CaseExpected): string {
  return `${v.classCode ?? '—'}/${v.cnpSeries ?? '—'}`;
}

async function main(): Promise<void> {
  console.log('=== A/B-тест правила 3.10 — карта аналогов брендов ===\n');

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
    const hit = evalBrandMap({ pumpTypeRequired: [c.input.reference] }, rules);
    codeResults.set(c.id, {
      classCode: hit ? hit.entry.classCode : null,
      cnpSeries: hit ? hit.entry.cnpSeries : null,
    });
  }

  // B — LLM
  const cfg = await getAiConfig();
  const llmResults = new Map<string, CaseExpected | { error: string }>();
  if (cfg.apiKey) {
    console.log(`LLM: запускаем через ${cfg.model}…\n`);
    const prompt = loadPrompt();
    for (const c of cases) {
      const userPrompt = `Вход:\n\`\`\`json\n${JSON.stringify(c.input, null, 2)}\n\`\`\`\n\nОтветь JSON.`;
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
  const w = llmEnabled ? 130 : 80;
  const header = llmEnabled
    ? `${'кейс'.padEnd(20)}${'ожид.'.padEnd(34)}${'код'.padEnd(34)}код=ож  ${'LLM'.padEnd(34)}LLM=код`
    : `${'кейс'.padEnd(20)}${'ожид.'.padEnd(34)}${'код'.padEnd(34)}код=ож`;
  console.log(header);
  console.log('─'.repeat(w));

  let codePass = 0;
  let llmPass = 0;
  let abMatch = 0;
  for (const c of cases) {
    const code = codeResults.get(c.id)!;
    const codeOk = eq(c.expected, code);
    if (codeOk) codePass++;
    let llmCol = '';
    let llmEq = '';
    const llm = llmResults.get(c.id);
    if (llm) {
      if ('error' in llm) {
        llmCol = `ERR: ${llm.error}`;
        llmEq = '✗';
      } else {
        llmCol = fmt(llm);
        const ok = eq(llm, code);
        if (eq(c.expected, llm)) llmPass++;
        if (ok) abMatch++;
        llmEq = ok ? '✓' : '✗';
      }
    }
    const row = llmEnabled
      ? `${c.id.padEnd(20)}${fmt(c.expected).padEnd(34)}${fmt(code).padEnd(34)}${(codeOk ? '✓' : '✗').padEnd(8)}${llmCol.padEnd(34)}${llmEq}`
      : `${c.id.padEnd(20)}${fmt(c.expected).padEnd(34)}${fmt(code).padEnd(34)}${codeOk ? '✓' : '✗'}`;
    console.log(row);
  }

  console.log('\n=== ИТОГ ===');
  console.log(`Код vs ожидание:    ${codePass}/${cases.length}`);
  if (llmEnabled) {
    console.log(`LLM vs ожидание:    ${llmPass}/${cases.length}`);
    console.log(`LLM vs код (A/B):   ${abMatch}/${cases.length}`);
  }
  if (codePass !== cases.length) {
    console.error('\n⚠ Код не совпадает с ожиданием.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
