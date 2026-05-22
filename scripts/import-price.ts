/**
 * CLI импорта прайсов в JSON-каталог (Фаза 3).
 *
 * Использование:
 *   npx tsx scripts/import-price.ts cnp <путь-к-csv>
 *
 * Парсит прайс, валидирует строки через zod, пишет `src/data/catalog/pumps.json`
 * и добавляет запись в `src/data/catalog/meta.json`. Выводит отчёт.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseCnpCsv } from '../src/lib/catalog/import/cnp-csv';
import { catalogPumpSchema, priceMetaSchema } from '../src/lib/catalog/schema';
import type { CatalogPump, PriceMeta } from '../src/lib/catalog/types';

const DATA_DIR = join(process.cwd(), 'src/data/catalog');
const PUMPS_FILE = join(DATA_DIR, 'pumps.json');
const META_FILE = join(DATA_DIR, 'meta.json');

function fail(msg: string): never {
  console.error(`Ошибка: ${msg}`);
  process.exit(1);
}

function importCnp(csvPath: string): void {
  let content: string;
  try {
    content = readFileSync(csvPath, 'utf8');
  } catch {
    fail(`не удалось прочитать файл «${csvPath}»`);
  }

  const { rows, meta, rejected } = parseCnpCsv(content, basename(csvPath));

  // Валидация каждой строки через zod.
  const accepted: CatalogPump[] = [];
  let zodRejected = 0;
  for (const row of rows) {
    const res = catalogPumpSchema.safeParse(row);
    if (res.success) {
      accepted.push(res.data);
    } else {
      zodRejected++;
      const issue = res.error.issues[0];
      console.warn(`  отклонено zod: ${row.sku} — ${issue?.path.join('.')}: ${issue?.message}`);
    }
  }

  const finalMeta: PriceMeta = { ...meta, rowCount: accepted.length };
  const metaRes = priceMetaSchema.safeParse(finalMeta);
  if (!metaRes.success) {
    fail(`метаданные не прошли валидацию: ${metaRes.error.issues[0]?.message}`);
  }

  // Запись pumps.json (полная замена позиций бренда CNP).
  writeFileSync(PUMPS_FILE, JSON.stringify(accepted, null, 2) + '\n', 'utf8');

  // Обновление meta.json: убираем прежнюю запись того же source, добавляем новую.
  let existingMeta: PriceMeta[] = [];
  try {
    existingMeta = JSON.parse(readFileSync(META_FILE, 'utf8')) as PriceMeta[];
  } catch {
    existingMeta = [];
  }
  const nextMeta = existingMeta.filter((m) => m.source !== finalMeta.source);
  nextMeta.push(metaRes.data);
  writeFileSync(META_FILE, JSON.stringify(nextMeta, null, 2) + '\n', 'utf8');

  // Отчёт.
  const withPower = accepted.filter((p) => p.powerKw !== undefined).length;
  console.log('');
  console.log('=== Импорт прайса CNP ===');
  console.log(`  Файл:              ${csvPath}`);
  console.log(`  Строк разобрано:   ${rows.length + rejected.length}`);
  console.log(`  Принято:           ${accepted.length}`);
  console.log(`  Отклонено (парсер):${rejected.length}`);
  console.log(`  Отклонено (zod):   ${zodRejected}`);
  console.log(`  С мощностью powerKw:${withPower} (${((withPower / accepted.length) * 100).toFixed(1)}%)`);
  console.log(`  Записано:          ${PUMPS_FILE}`);
  console.log(`  Метаданные:        ${META_FILE}`);
  if (rejected.length > 0) {
    console.log('');
    console.log('  Примеры отклонённых строк (парсер):');
    rejected.slice(0, 10).forEach((r) => {
      console.log(`    стр.${r.line}: ${r.reason} — [${r.raw.join(', ')}]`);
    });
  }
}

function main(): void {
  const [adapter, filePath] = process.argv.slice(2);
  if (!adapter || !filePath) {
    fail('использование: tsx scripts/import-price.ts <adapter> <path>\n  доступные адаптеры: cnp');
  }
  switch (adapter) {
    case 'cnp':
      importCnp(filePath);
      break;
    default:
      fail(`неизвестный адаптер «${adapter}». Доступно: cnp`);
  }
}

main();
