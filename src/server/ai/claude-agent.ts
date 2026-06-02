/**
 * Адаптер: запуск Claude Code CLI как агента — альтернатива Kimi CLI с ТЕМ ЖЕ
 * контрактом (`KimiAgentParams → KimiAgentResult`). Нужен, когда квота Kimi
 * исчерпана (403) или для сравнения бэкендов.
 *
 * Тот же MCP-сервер к нашей БД (find_collector/find_pump_by_sku/search_catalog),
 * тот же workspace (там лежит `.claude/skills/pump-station-calc` — Claude Code
 * сам обнаруживает скил по cwd). Переключение — env `CALC_AGENT=claude`.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getKimiConfig, genericAgentError } from './kimi-config';
import type { KimiAgentParams, KimiAgentResult } from './kimi-agent';

const execFileAsync = promisify(execFile);

/**
 * Запускает Claude Code в headless-режиме (`-p --output-format text`) с MCP к
 * нашей БД. Инструменты — по ЯВНОМУ allowlist (не bypass): только то, что нужно
 * расчёту/подбору/парсингу (скил, чтение, веб, БД через MCP, Bash для извлечения
 * сканов). Любой инструмент вне списка в headless просто не выполняется.
 * Скил подхватывается из `.claude/skills` в workspace.
 */

/** Инструменты, разрешённые агенту-расчётчику (sandbox через allowlist).
 *  Без Bash: расчёту/подбору shell не нужен, а сканы ТЗ Claude читает нативно
 *  через Read (PDF/картинки). Любой инструмент вне списка в headless не исполнится. */
const ALLOWED_TOOLS = [
  'Skill',        // вызов скила pump-station-calc
  'Read',         // чтение KNOWLEDGE / скила / файлов ТЗ (вкл. PDF/изображения)
  'Glob',
  'Grep',
  'WebSearch',    // подбор продукции/цен в вебе
  'WebFetch',
  'mcp__gstation-db', // каталог/прайс из нашей БД (все инструменты сервера)
];
export async function runClaudeAgent(params: KimiAgentParams): Promise<KimiAgentResult> {
  // workspace берём из той же конфигурации (KIMI_AGENT_WORKSPACE = gidrostroy,
  // где лежат скилы). apiKey Kimi тут НЕ требуется.
  const cfg = await getKimiConfig();
  const workspace = params.workspace ?? cfg.workspace;
  const bin = process.env.CLAUDE_BIN || 'claude';

  // MCP-сервер к БД — идентично kimi-пути (tsx из корня g-station).
  const root = process.cwd();
  const mcpJson = JSON.stringify({
    mcpServers: {
      'gstation-db': {
        command: 'sh',
        args: ['-c', `cd ${JSON.stringify(root)} && exec node_modules/.bin/tsx src/server/mcp/db-server.ts`],
      },
    },
  });

  const dir = await mkdtemp(join(tmpdir(), 'claude-agent-'));
  const mcpPath = join(dir, 'mcp.json');
  try {
    await writeFile(mcpPath, mcpJson, 'utf-8');

    const prompt = params.skill
      ? `Используй skill \`${params.skill}\`. ${params.prompt}`
      : params.prompt;

    const args = [
      '--print',
      '--output-format',
      'text',
      '--mcp-config',
      mcpPath,
      '--add-dir',
      workspace,
      ...(params.addDirs ?? []).flatMap((d) => ['--add-dir', d]),
      '--allowedTools',
      ...ALLOWED_TOOLS,
      '-p',
      prompt,
    ];

    try {
      const { stdout } = await execFileAsync(bin, args, {
        timeout: params.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024,
        cwd: workspace,
        env: { ...process.env },
        signal: params.signal,
      });
      return { output: stdout.trim() };
    } catch (e) {
      const err = e as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
      const detail = [
        err.killed ? 'таймаут/убит' : err.code != null ? `exit ${err.code}` : '',
        (err.stderr || '').trim().slice(-500),
        (err.stdout || '').trim().slice(-300),
      ]
        .filter(Boolean)
        .join(' | ');
      console.warn('[agent:claude]', detail || (e as Error).message);
      throw new Error(genericAgentError(detail));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
