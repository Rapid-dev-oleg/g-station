/**
 * Session-раннер для пайплайна «шаг = скил» (Фаза 3). В отличие от runKimiAgent
 * (одноразовый прогон), держит ОДНУ сессию агента через шаги: первый вызов
 * возвращает sessionId, следующие продолжают его (`--resume`/`--session`) →
 * контекст предыдущих шагов сохраняется. Оба бэкенда:
 *   • claude: `--output-format json` (session_id в ответе) + `--resume <id>`;
 *   • kimi:   `--output-format stream-json` (session_id в событиях) + `--session <id>`.
 *
 * Проверено (claude, локально): шаг 1 «запомни 7» → шаг 2 «какое число?» → «7».
 * kimi-путь миррорит рабочий конфиг runKimiAgent (на проде kimi по OAuth).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getKimiConfig, getCalcAgent, genericAgentError } from './kimi-config';
import { buildConfigToml } from './kimi-agent';

const execFileAsync = promisify(execFile);

/** Инструменты агента-расчётчика (как в claude-agent). */
const ALLOWED_TOOLS = ['Skill', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'mcp__gstation-db'];

export interface StepParams {
  /** Задача шагу (естественный язык). */
  prompt: string;
  /** ID сессии для продолжения; пусто — начать новую. */
  sessionId?: string;
  /** Скил (директива в начало промпта). */
  skill?: string;
  workspace?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface StepResult {
  /** Финальный текст ответа шага. */
  output: string;
  /** ID сессии — передать в следующий шаг для сохранения контекста. */
  sessionId: string;
}

function mcpConfig(): string {
  const root = process.cwd();
  return JSON.stringify({
    mcpServers: {
      'gstation-db': {
        command: 'sh',
        args: ['-c', `cd ${JSON.stringify(root)} && exec node_modules/.bin/tsx src/server/mcp/db-server.ts`],
      },
    },
  });
}

function fail(tag: string, e: unknown): never {
  const err = e as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
  const detail = [
    err.killed ? 'таймаут/убит' : err.code != null ? `exit ${err.code}` : '',
    (err.stderr || '').trim().slice(-500),
    (err.stdout || '').trim().slice(-300),
  ].filter(Boolean).join(' | ');
  console.warn(`[session:${tag}]`, detail || (e as Error).message);
  throw new Error(genericAgentError(detail));
}

/** Один шаг пайплайна в общей сессии. Диспетчит бэкенд как runKimiAgent. */
export async function runAgentStep(params: StepParams): Promise<StepResult> {
  return (await getCalcAgent()) === 'claude' ? runClaudeStep(params) : runKimiStep(params);
}

async function runClaudeStep(p: StepParams): Promise<StepResult> {
  const cfg = await getKimiConfig();
  const workspace = p.workspace ?? cfg.workspace;
  const bin = process.env.CLAUDE_BIN || 'claude';
  const dir = await mkdtemp(join(tmpdir(), 'claude-step-'));
  const mcpPath = join(dir, 'mcp.json');
  try {
    await writeFile(mcpPath, mcpConfig(), 'utf-8');
    const prompt = p.skill ? `Используй skill \`${p.skill}\`. ${p.prompt}` : p.prompt;
    const args = [
      '--print', '--output-format', 'json',
      '--mcp-config', mcpPath,
      '--add-dir', workspace,
      '--allowedTools', ...ALLOWED_TOOLS,
      ...(p.sessionId ? ['--resume', p.sessionId] : []),
      '-p', prompt,
    ];
    try {
      const { stdout } = await execFileAsync(bin, args, {
        timeout: p.timeoutMs ?? 10 * 60 * 1000, maxBuffer: 50 * 1024 * 1024,
        cwd: workspace, env: { ...process.env }, signal: p.signal,
      });
      const parsed = JSON.parse(stdout) as { result?: string; session_id?: string };
      return { output: (parsed.result ?? '').trim(), sessionId: parsed.session_id ?? '' };
    } catch (e) { fail('claude', e); }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runKimiStep(p: StepParams): Promise<StepResult> {
  const cfg = await getKimiConfig();
  if (!cfg.apiKey) throw new Error('Сервис расчёта не настроен — укажите ключ в Настройках');
  const workspace = p.workspace ?? cfg.workspace;
  const dir = await mkdtemp(join(tmpdir(), 'kimi-step-'));
  const configPath = join(dir, 'config.toml');
  const mcpPath = join(dir, 'mcp.json');
  try {
    await writeFile(configPath, buildConfigToml(cfg.apiKey, cfg.baseUrl, cfg.skillsDirs), 'utf-8');
    await writeFile(mcpPath, mcpConfig(), 'utf-8');
    const prompt = p.skill ? `Используй skill \`${p.skill}\`. ${p.prompt}` : p.prompt;
    const args = [
      '--print', '--output-format', 'stream-json',
      '--config-file', configPath,
      '--mcp-config-file', mcpPath,
      '-w', workspace,
      ...(p.sessionId ? ['--session', p.sessionId] : []),
      '-p', prompt,
    ];
    try {
      const { stdout } = await execFileAsync(cfg.binPath, args, {
        timeout: p.timeoutMs ?? 10 * 60 * 1000, maxBuffer: 50 * 1024 * 1024,
        cwd: workspace, env: { ...process.env }, signal: p.signal,
      });
      return parseKimiStream(stdout);
    } catch (e) { fail('kimi', e); }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Извлекает session_id и финальный текст из stream-json событий kimi. */
function parseKimiStream(stdout: string): StepResult {
  let sessionId = '';
  const texts: string[] = [];
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s) as Record<string, unknown>;
      const sid = ev.session_id ?? ev.sessionId ?? (ev.session as { id?: string } | undefined)?.id;
      if (typeof sid === 'string' && sid) sessionId = sid;
      // финальный текст: событие result/assistant с content/result/text
      const t = ev.result ?? ev.text ?? (ev.message as { content?: string } | undefined)?.content;
      if (typeof t === 'string' && t.trim()) texts.push(t.trim());
    } catch {
      // не-JSON строка (напр. plain-текст) — берём как есть
      texts.push(s);
    }
  }
  return { output: texts.join('\n').trim(), sessionId };
}
