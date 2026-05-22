/**
 * Извлечение простого текста из загруженного документа ТЗ.
 *
 * Шаг 1.2 методики (скил pump-station-calc, «шаг1-вход.md»).
 * Поддержанные форматы: .txt (utf-8/cp1251), .pdf (системный pdftotext),
 * .docx (библиотека mammoth). Прочие форматы — внятная ошибка.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Распознанный формат документа. */
export type DocFormat = 'txt' | 'pdf' | 'docx';

export interface ExtractedText {
  /** Извлечённый простой текст. */
  text: string;
  /** Распознанный формат. */
  format: DocFormat;
}

/** Определяет формат по имени файла. */
function detectFormat(filename: string): DocFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  throw new Error(
    `Неподдерживаемый формат файла «${filename}». Допустимы: .txt, .pdf, .docx`,
  );
}

/**
 * Декодирует .txt. Пробует UTF-8; если видны типичные артефакты
 * битой кириллицы (заметка менеджера часто в CP1251) — перекодирует.
 */
function decodeTxt(buffer: Buffer): string {
  const utf8 = buffer.toString('utf-8');
  // U+FFFD — replacement char: признак неверной кодировки.
  if (utf8.includes('�')) {
    return buffer.toString('latin1');
  }
  return utf8;
}

/** Извлекает текст из .pdf через системный pdftotext -layout. */
async function extractPdf(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gstation-pdf-'));
  const src = join(dir, 'doc.pdf');
  try {
    await writeFile(src, buffer);
    // «-» во втором аргументе — вывод в stdout.
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', src, '-'],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (e) {
    throw new Error(
      'Не удалось извлечь текст из PDF. ' +
        'Возможно, это скан без текстового слоя. ' +
        (e instanceof Error ? e.message : String(e)),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Извлекает текст из .docx через mammoth (extractRawText). */
async function extractDocx(buffer: Buffer): Promise<string> {
  // Динамический импорт — mammoth тяжёлый, нужен только для .docx.
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Извлекает простой текст из буфера загруженного файла.
 * Возвращает текст и распознанный формат; на пустом результате — ошибка.
 */
export async function extractText(
  filename: string,
  buffer: Buffer,
): Promise<ExtractedText> {
  const format = detectFormat(filename);

  let text: string;
  if (format === 'txt') {
    text = decodeTxt(buffer);
  } else if (format === 'pdf') {
    text = await extractPdf(buffer);
  } else {
    text = await extractDocx(buffer);
  }

  text = text.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) {
    throw new Error(
      'Документ не содержит извлекаемого текста ' +
        '(пустой файл или скан без текстового слоя).',
    );
  }

  return { text, format };
}
