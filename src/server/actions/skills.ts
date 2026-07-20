'use server';

/**
 * Редактирование методики из браузера: скилы (.claude/skills) и база знаний
 * (KNOWLEDGE) — markdown/csv-файлы в рабочей директории агента. Их читает
 * Kimi-агент, поэтому правка тут сразу влияет на расчёт.
 *
 * ВАЖНО (деплой): workspace должен быть ЗАПИСЫВАЕМЫМ (volume), не «запечён»
 * read-only в образ. Путь — KIMI_AGENT_WORKSPACE (см. kimi-config.ts).
 *
 * Безопасность: правка разрешена ТОЛЬКО внутри whitelisted-корней и только
 * для текстовых расширений; `..` и выход за корень запрещены.
 */

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join, relative, resolve, dirname, extname } from 'node:path';
import type { SkillFile } from './skills-types';
import { runKimiAgent } from '@/server/ai/kimi-agent';

const WORKSPACE = process.env.KIMI_AGENT_WORKSPACE || process.cwd();

/** Корни, которые разрешено редактировать (относительно workspace). */
const EDITABLE_ROOTS = ['.claude/skills', 'KNOWLEDGE'];
/** Текстовые расширения, доступные для правки. */
const EDITABLE_EXT = new Set(['.md', '.csv', '.json', '.txt']);

/** Проверяет, что относительный путь лежит внутри разрешённого корня. */
function guard(relPath: string): string {
  const abs = resolve(WORKSPACE, relPath);
  const rel = relative(WORKSPACE, abs);
  if (rel.startsWith('..') || resolve(WORKSPACE, rel) !== abs) {
    throw new Error('Путь вне рабочей директории');
  }
  const underRoot = EDITABLE_ROOTS.some((r) => rel === r || rel.startsWith(r + '/'));
  if (!underRoot) throw new Error('Редактирование разрешено только в скилах и KNOWLEDGE');
  if (!EDITABLE_EXT.has(extname(rel).toLowerCase())) {
    throw new Error('Можно править только текстовые файлы (.md/.csv/.json/.txt)');
  }
  return abs;
}

async function walk(dir: string, acc: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.~')) continue; // lock-файлы редакторов
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else if (EDITABLE_EXT.has(extname(e.name).toLowerCase())) acc.push(full);
  }
}

/** Список редактируемых файлов методики. */
export async function listSkillFiles(): Promise<SkillFile[]> {
  const out: SkillFile[] = [];
  for (const root of EDITABLE_ROOTS) {
    const files: string[] = [];
    await walk(join(WORKSPACE, root), files);
    for (const f of files) {
      const s = await stat(f);
      out.push({ path: relative(WORKSPACE, f), size: s.size, root });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Прочитать файл методики. */
export async function readSkillFile(path: string): Promise<{ path: string; content: string }> {
  const abs = guard(path);
  const content = await readFile(abs, 'utf-8');
  return { path, content };
}

/**
 * ИИ-правка файла методики по описанию инженера. НЕ сохраняет — возвращает
 * предложенный текст целиком, инженер сверяет (дифф) и применяет сам.
 * Напр.: «минимальный свободный напор считать не 10, а 12 м».
 */
export async function proposeSkillEdit(
  path: string,
  instruction: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const abs = guard(path);
    if (!instruction.trim()) return { ok: false, error: 'Опишите правку' };
    const current = await readFile(abs, 'utf-8');
    // Через рабочий CLI-агент (OAuth), не чат-API. Текст файла — прямо в промпте,
    // агенту не нужен доступ к диску → оригинал не трогается при предпросмотре.
    const prompt =
      'Ты — редактор текстового файла методики расчёта насосных станций. Тебе дают ' +
      'ИНСТРУКЦИЮ инженера и ТЕКУЩИЙ файл. Верни ТОЛЬКО полный изменённый файл целиком ' +
      'между строками-маркерами <<<RESULT>>> и <<<END_RESULT>>> (каждый маркер на своей ' +
      'строке). Меняй ТОЛЬКО то, что просит инструкция; всё остальное сохрани дословно ' +
      '(заголовки, нумерацию, формат markdown). Ничего не пиши на диск, никаких пояснений ' +
      'вне маркеров.\n\n' +
      `ИНСТРУКЦИЯ ИНЖЕНЕРА:\n${instruction.trim()}\n\n` +
      `=== ТЕКУЩИЙ ФАЙЛ «${path}» ===\n${current}\n=== КОНЕЦ ФАЙЛА ===`;
    const { output } = await runKimiAgent({ prompt, timeoutMs: 3 * 60 * 1000 });
    const m = output.match(/<<<RESULT>>>\n?([\s\S]*?)\n?<<<END_RESULT>>>/);
    let out = (m ? m[1] : output).trim();
    out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
    if (!out) return { ok: false, error: 'ИИ вернул пустой результат' };
    return { ok: true, content: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка ИИ-правки' };
  }
}

/** Сохранить файл методики (создаёт, если не было). */
export async function saveSkillFile(
  path: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const abs = guard(path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка записи' };
  }
}
