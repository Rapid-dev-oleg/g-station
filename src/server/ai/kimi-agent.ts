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
import { getKimiConfig } from './kimi-config';

const execFileAsync = promisify(execFile);

/** TOML-конфиг Kimi CLI: ключ из настроек, endpoint, доп. директории скилов. */
function buildConfigToml(apiKey: string, baseUrl: string, skillsDirs: string[]): string {
  const dirs = skillsDirs.map((d) => JSON.stringify(d)).join(', ');
  return [
    'default_model = "kimi-code/kimi-for-coding"',
    'default_thinking = false',
    skillsDirs.length ? `extra_skills_dirs = [${dirs}]` : '',
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
    // Веб-поиск и загрузка страниц — для подбора продукции (артикулы, цены,
    // наличие у поставщиков). Тем же ключом (в дефолтном конфиге они на oauth).
    '[services.moonshot_search]',
    'base_url = "https://api.kimi.com/coding/v1/search"',
    `api_key = ${JSON.stringify(apiKey)}`,
    '',
    '[services.moonshot_fetch]',
    'base_url = "https://api.kimi.com/coding/v1/fetch"',
    `api_key = ${JSON.stringify(apiKey)}`,
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
  const cfg = await getKimiConfig();
  if (!cfg.apiKey) {
    throw new Error('Ключ Kimi не задан — укажите его в Настройках или MOONSHOT_API_KEY');
  }

  const workspace = params.workspace ?? cfg.workspace;
  const toml = buildConfigToml(cfg.apiKey, cfg.baseUrl, cfg.skillsDirs);

  const dir = await mkdtemp(join(tmpdir(), 'kimi-agent-'));
  const configPath = join(dir, 'config.toml');
  try {
    await writeFile(configPath, toml, 'utf-8');

    const prompt = params.skill
      ? `Используй skill \`${params.skill}\`. ${params.prompt}`
      : params.prompt;

    const args = [
      '--print',
      '--quiet',
      '--config-file',
      configPath,
      '-w',
      workspace,
      '-p',
      prompt,
    ];

    const { stdout } = await execFileAsync(cfg.binPath, args, {
      timeout: params.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: workspace,
      env: { ...process.env },
    });

    return { output: stdout.trim() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
