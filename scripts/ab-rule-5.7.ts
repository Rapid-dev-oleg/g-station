/**
 * A/B-тест правила 5.7 v2 — материал коллектора.
 *
 * На одном наборе фикстур сравнивает два независимых источника:
 *   A. Код    — TS-функция `evalMaterial` поверх RuleConfig из БД.
 *   B. LLM    — Claude через OpenRouter с инструкцией `prompt.md`.
 * И сверяет оба с ожиданием `expected` в `fixtures.json`.
 *
 * Если ключ OpenRouter не задан — LLM-часть пропускается, остаётся
 * только code-vs-expected (полезно в CI).
 *
 * Запуск: npx tsx scripts/ab-rule-5.7.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MaterialRuleV1, Rules } from '@/lib/engine/rules';
import { evalMaterial } from '@/lib/engine/rules';
import { loadRules } from '@/server/rules-loader';
import { askAi, getAiConfig } from '@/server/ai';

interface CaseExpected {
  material: 'нержавеющая-сталь' | 'углеродистая-сталь';
  triggerId: string | null;
}

interface FixtureCase {
  id: string;
  _description?: string;
  input: Record<string, unknown>;
  expected: CaseExpected;
}

interface FixturesFile {
  cases: FixtureCase[];
}

interface RunResult {
  caseId: string;
  expected: CaseExpected;
  code: CaseExpected;
  llm?: CaseExpected | { error: string };
}

function loadFixtures(): FixtureCase[] {
  const path = join(process.cwd(), 'tests/ab/rule-5.7/fixtures.json');
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as FixturesFile;
  return data.cases;
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'tests/ab/rule-5.7/prompt.md'), 'utf-8');
}

/** Достаёт JSON из ответа LLM (с markdown-обёрткой ```json или без). */
function parseJsonAnywhere(text: string): CaseExpected {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : text).trim();
  return JSON.parse(body) as CaseExpected;
}

async function runCode(rule: MaterialRuleV1, cases: FixtureCase[]): Promise<Map<string, CaseExpected>> {
  const out = new Map<string, CaseExpected>();
  for (const c of cases) {
    const r = evalMaterial(rule, c.input as never);
    out.set(c.id, {
      material: r.material as 'нержавеющая-сталь' | 'углеродистая-сталь',
      triggerId: r.triggerId,
    });
  }
  return out;
}

async function runLlm(
  cases: FixtureCase[],
  prompt: string,
): Promise<Map<string, CaseExpected | { error: string }>> {
  const out = new Map<string, CaseExpected | { error: string }>();
  for (const c of cases) {
    const userPrompt = `Вход:\n\`\`\`json\n${JSON.stringify(c.input, null, 2)}\n\`\`\`\n\nОтветь JSON по формату из инструкции.`;
    try {
      const r = await askAi({ system: prompt, prompt: userPrompt, jsonMode: true });
      const parsed = parseJsonAnywhere(r.content);
      out.set(c.id, {
        material: parsed.material,
        triggerId: parsed.triggerId,
      });
    } catch (e) {
      out.set(c.id, { error: (e as Error).message.slice(0, 150) });
    }
  }
  return out;
}

function fmt(v: CaseExpected): string {
  return `${v.material === 'нержавеющая-сталь' ? 'НРЖ' : 'УГЛ'} / ${v.triggerId ?? '—'}`;
}

function isMatch(a: CaseExpected, b: CaseExpected): boolean {
  return a.material === b.material && a.triggerId === b.triggerId;
}

async function main(): Promise<void> {
  console.log('=== A/B-тест правила 5.7 v2 — материал коллектора ===\n');

  const cases = loadFixtures();
  console.log(`Фикстур: ${cases.length}`);

  const { rules } = await loadRules();
  if (!rules.material) {
    console.error('В БД нет активного правила 5.7-material. Запусти `npx prisma db seed`.');
    process.exit(1);
  }
  console.log(`Правило: 5.7-material ${rules.material.version}\n`);

  // A — код
  const codeResults = await runCode(rules.material, cases);

  // B — LLM (если есть ключ)
  const cfg = await getAiConfig();
  let llmResults: Map<string, CaseExpected | { error: string }> | undefined;
  if (cfg.apiKey) {
    console.log(`LLM: запускаем через ${cfg.model}…\n`);
    const prompt = loadPrompt();
    llmResults = await runLlm(cases, prompt);
  } else {
    console.log('LLM: ключ OpenRouter не задан — пропускаем (только code-vs-expected).\n');
  }

  // Сводка
  const rows: RunResult[] = cases.map((c) => ({
    caseId: c.id,
    expected: c.expected,
    code: codeResults.get(c.id)!,
    llm: llmResults?.get(c.id),
  }));

  // Шапка
  const llmHeader = llmResults ? `${'LLM'.padEnd(32)}LLM=код  ` : '';
  console.log(`${'кейс'.padEnd(30)}${'ожидание'.padEnd(32)}${'код'.padEnd(32)}код=ожид ${llmHeader}`);
  console.log('─'.repeat(llmResults ? 140 : 100));

  let codePass = 0;
  let llmPass = 0;
  let abMatch = 0;
  for (const r of rows) {
    const expStr = fmt(r.expected);
    const codeStr = fmt(r.code);
    const codeOk = isMatch(r.expected, r.code);
    if (codeOk) codePass++;
    let llmStr = '';
    let llmOkStr = '';
    if (r.llm) {
      if ('error' in r.llm) {
        llmStr = `ERR: ${r.llm.error}`;
        llmOkStr = '✗';
      } else {
        llmStr = fmt(r.llm);
        const llmOk = isMatch(r.llm, r.code);
        if (isMatch(r.expected, r.llm)) llmPass++;
        if (llmOk) abMatch++;
        llmOkStr = llmOk ? '✓' : '✗';
      }
    }
    console.log(
      `${r.caseId.padEnd(30)}${expStr.padEnd(32)}${codeStr.padEnd(32)}${(codeOk ? '✓' : '✗').padEnd(9)}${llmStr.padEnd(32)}${llmOkStr}`,
    );
  }

  console.log('\n=== ИТОГ ===');
  console.log(`Код vs ожидание:    ${codePass}/${cases.length}`);
  if (llmResults) {
    console.log(`LLM vs ожидание:    ${llmPass}/${cases.length}`);
    console.log(`LLM vs код (A/B):   ${abMatch}/${cases.length}`);
  }
  if (codePass !== cases.length) {
    console.error('\n⚠ Код не совпадает с ожиданием — проверь сидинг RuleConfig или фикстуры.');
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import('@/server/db');
    await db.$disconnect();
  });
