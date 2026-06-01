/**
 * Извлечение изображений из документа для vision-разбора (Kimi).
 *
 * Применяется когда текстовый слой пуст (скан / документ-картинка):
 *  - PDF  → постранично в PNG через `pdftoppm` (poppler);
 *  - DOCX → встроенные картинки `word/media/*` через `unzip`;
 *  - PNG/JPG/WEBP/GIF → как есть.
 *
 * Системные инструменты (pdftoppm, unzip) — не парсеры формата,
 * а извлечение растровых вложений; разбор содержимого делает LLM.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { KimiImage } from './kimi';

const execFileAsync = promisify(execFile);

/** Максимум страниц/картинок, отдаваемых в vision (защита от гигантских PDF). */
const MAX_IMAGES = 20;

function mimeByExt(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

/** PDF → PNG постранично. 110 dpi достаточно для распознавания текста vision'ом
 *  и держит размер под контролем: 150 dpi на тяжёлых ПД давало ~7 МБ/стр →
 *  десятки МБ base64 в памяти и неподъёмный запрос к Kimi (и OOM сервера). */
async function pdfToImages(buffer: Buffer): Promise<KimiImage[]> {
  const dir = await mkdtemp(join(tmpdir(), 'gstation-pdfimg-'));
  const src = join(dir, 'doc.pdf');
  try {
    await writeFile(src, buffer);
    try {
      await execFileAsync(
        'pdftoppm',
        ['-png', '-r', '110', '-l', String(MAX_IMAGES), src, join(dir, 'page')],
        { maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 },
      );
    } catch (e) {
      // Прокидываем настоящую причину (stderr/таймаут/убит), иначе видно только
      // «Command failed: pdftoppm».
      const err = e as { killed?: boolean; signal?: string; stderr?: string };
      const why = err.killed
        ? `прерван (таймаут/память${err.signal ? ', ' + err.signal : ''})`
        : (err.stderr || '').trim().slice(-300) || (e as Error).message;
      throw new Error(`pdftoppm не смог отрендерить PDF: ${why}`);
    }
    const files = (await readdir(dir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    const out: KimiImage[] = [];
    for (const f of files.slice(0, MAX_IMAGES)) {
      const data = await readFile(join(dir, f));
      out.push({ mediaType: 'image/png', base64: data.toString('base64') });
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** DOCX → встроенные растровые картинки из word/media. */
async function docxToImages(buffer: Buffer): Promise<KimiImage[]> {
  const dir = await mkdtemp(join(tmpdir(), 'gstation-docximg-'));
  const src = join(dir, 'doc.docx');
  try {
    await writeFile(src, buffer);
    // Список вложений word/media.
    const { stdout } = await execFileAsync('unzip', ['-Z1', src], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const media = stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((n) => /^word\/media\/.+\.(png|jpe?g|webp|gif)$/i.test(n))
      .slice(0, MAX_IMAGES);

    const out: KimiImage[] = [];
    for (const name of media) {
      // Извлекаем конкретный файл в stdout.
      const { stdout: raw } = await execFileAsync('unzip', ['-p', src, name], {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'buffer',
      });
      out.push({ mediaType: mimeByExt(name), base64: (raw as Buffer).toString('base64') });
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Превращает документ в набор изображений для vision-разбора.
 * Поддерживает pdf, docx и сами изображения. Для прочих форматов — [].
 */
export async function documentToImages(filename: string, buffer: Buffer): Promise<KimiImage[]> {
  const n = filename.toLowerCase();
  if (n.endsWith('.pdf')) return pdfToImages(buffer);
  if (n.endsWith('.docx')) return docxToImages(buffer);
  if (/\.(png|jpe?g|webp|gif)$/.test(n)) {
    return [{ mediaType: mimeByExt(n), base64: buffer.toString('base64') }];
  }
  return [];
}
