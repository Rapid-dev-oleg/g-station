/**
 * Запуск Kimi CLI как агента (subprocess) для задач, требующих скилов:
 * расчёт станции по методике `pump-station-calc`, многошаговые workflow.
 *
 * Почему CLI, а не chat completion: скилы (Kimi Skills = формат SKILL.md)
 * и многошаговый агентный цикл доступны только через Kimi CLI / agent API,
 * не через одиночный chat-запрос. Агент сам читает SKILL.md + KNOWLEDGE
 * из workspace и проходит конвейер расчёта.
 *
 * Конфиг (ключ, endpoint, директории скилов) генерируется на лету из
 * настроек приложения — НЕ из `~/.kimi/config.toml` (там может быть
 * протухший oauth-токен и чужие настройки).
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getKimiConfig, getCalcAgent, genericAgentError } from './kimi-config';
import { runClaudeAgent } from './claude-agent';

const execFileAsync = promisify(execFile);

/** TOML-конфиг Kimi CLI: ключ из настроек, endpoint, доп. директории скилов. */
function buildConfigToml(apiKey: string, baseUrl: string, skillsDirs: string[]): string {
  const dirs = skillsDirs.map((d) => JSON.stringify(d)).join(', ');
  return [
    'default_model = "kimi-code/kimi-for-coding"',
    'default_thinking = false',
    skillsDirs.length ? `extra_skills_dirs = [${dirs}]` : '',
    '',
    // Расчёт + веб-подбор продукции требует много шагов (search/fetch).
    '[loop_control]',
    'max_steps_per_turn = 220',
    '',
    '[models."kimi-code/kimi-for-coding"]',
    'provider = "managed:kimi-code"',
    'model = "kimi-for-coding"',
    'max_context_size = 262144',
    'capabilities = ["image_in", "video_in", "thinking"]',
    '',
    '[providers."managed:kimi-code"]',
    'type = "kimi"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    `api_key = ${JSON.stringify(apiKey)}`,
    '',
    // OAuth-авторизация (kimi login → ~/.kimi/credentials/kimi-code.json).
    // Для managed:kimi-code это ОСНОВНОЙ способ входа: при наличии oauth-блока
    // CLI берёт токен из файла и игнорирует api_key (тот всё равно обязателен по
    // схеме конфига). Без блока CLI ходит по api_key и на протухшем ключе — 401.
    '[providers."managed:kimi-code".oauth]',
    'storage = "file"',
    'key = "oauth/kimi-code"',
    '',
    // Веб-поиск и загрузка страниц — для подбора продукции (артикулы, цены,
    // наличие у поставщиков). Авторизация — тем же OAuth-токеном kimi-code.
    '[services.moonshot_search]',
    'base_url = "https://api.kimi.com/coding/v1/search"',
    `api_key = ${JSON.stringify(apiKey)}`,
    '',
    '[services.moonshot_search.oauth]',
    'storage = "file"',
    'key = "oauth/kimi-code"',
    '',
    '[services.moonshot_fetch]',
    'base_url = "https://api.kimi.com/coding/v1/fetch"',
    `api_key = ${JSON.stringify(apiKey)}`,
    '',
    '[services.moonshot_fetch.oauth]',
    'storage = "file"',
    'key = "oauth/kimi-code"',
    '',
  ].join('\n');
}

export interface KimiAgentParams {
  /** Задача агенту (естественный язык). */
  prompt: string;
  /**
   * Имя скила, который надо применить (например 'pump-station-calc').
   * Подставляется в начало промпта как явная директива.
   */
  skill?: string;
  /**
   * Рабочая директория агента. Здесь должны лежать `.claude/skills/<скилы>`
   * и данные (KNOWLEDGE). По умолчанию — workspace из настроек.
   */
  workspace?: string;
  /** Доп. таймаут в мс (агент думает долго). По умолчанию 10 минут. */
  timeoutMs?: number;
  /** Доп. директории в скоуп агента (--add-dir) — напр. папка с файлами ТЗ,
   *  которые агент читает сам (read_media/shell), без локального извлечения. */
  addDirs?: string[];
  /** Сигнал остановки: при abort Node убивает дочерний процесс CLI (а не ждёт таймаута). */
  signal?: AbortSignal;
}

export interface KimiAgentResult {
  /** Финальный текст ответа агента (ожидается JSON — парсит вызывающий). */
  output: string;
}

/**
 * Запускает Kimi CLI в неинтерактивном режиме (`--print --quiet`),
 * автоматически одобряя действия (`--print` подразумевает `--yolo`).
 */
export async function runKimiAgent(params: KimiAgentParams): Promise<KimiAgentResult> {
  // Переключатель бэкенда (из Настроек): claude → считаем через Claude Code CLI.
  // Тот же контракт, MCP и скилы.
  if ((await getCalcAgent()) === 'claude') {
    return runClaudeAgent(params);
  }

  const cfg = await getKimiConfig();
  if (!cfg.apiKey) {
    throw new Error('Сервис расчёта не настроен — укажите ключ в Настройках');
  }

  const workspace = params.workspace ?? cfg.workspace;
  const toml = buildConfigToml(cfg.apiKey, cfg.baseUrl, cfg.skillsDirs);

  // MCP-сервер к нашей БД — даёт агенту точные каталог/прайс (find_collector,
  // find_pump_by_sku, search_catalog…), чтобы не гадать вебом. Запускается
  // через локальный tsx из корня проекта (process.cwd() = корень g-station).
  const root = process.cwd();
  const mcpJson = JSON.stringify({
    mcpServers: {
      'gstation-db': {
        command: 'sh',
        args: ['-c', `cd ${JSON.stringify(root)} && exec node_modules/.bin/tsx src/server/mcp/db-server.ts`],
      },
    },
  });

  const dir = await mkdtemp(join(tmpdir(), 'kimi-agent-'));
  const configPath = join(dir, 'config.toml');
  const mcpPath = join(dir, 'mcp.json');
  try {
    await writeFile(configPath, toml, 'utf-8');
    await writeFile(mcpPath, mcpJson, 'utf-8');

    const prompt = params.skill
      ? `Используй skill \`${params.skill}\`. ${params.prompt}`
      : params.prompt;

    const args = [
      '--print',
      '--quiet',
      '--config-file',
      configPath,
      '--mcp-config-file',
      mcpPath,
      '-w',
      workspace,
      ...(params.addDirs ?? []).flatMap((d) => ['--add-dir', d]),
      '-p',
      prompt,
    ];

    try {
      const { stdout } = await execFileAsync(cfg.binPath, args, {
        timeout: params.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024,
        cwd: workspace,
        env: { ...process.env },
        signal: params.signal,
      });
      return { output: stdout.trim() };
    } catch (e) {
      // execFile при ненулевом exit / таймауте кладёт stdout/stderr в ошибку —
      // прокидываем их в сообщение для диагностики (иначе видно только «Command failed»).
      const err = e as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
      const detail = [
        err.killed ? 'таймаут/убит' : err.code != null ? `exit ${err.code}` : '',
        (err.stderr || '').trim().slice(-500),
        (err.stdout || '').trim().slice(-300),
      ]
        .filter(Boolean)
        .join(' | ');
      // Детали — только в лог; наружу нейтральное сообщение без упоминания движка.
      console.warn('[agent:kimi]', detail || (e as Error).message);
      throw new Error(genericAgentError(detail));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
