/**
 * CLI импорта прайсов в БД-каталог (Фаза 3).
 *
 * Использование:
 *   tsx scripts/import-price.ts cnp <путь-к-csv>
 *   tsx scripts/import-price.ts wellmix <путь-к-pdf>
 *
 * Логика:
 *  1. Адаптер разбирает файл прайса → `ImportResult` (строки + meta).
 *  2. Каждая строка валидируется zod-схемой `importPriceRowSchema`.
 *  3. В одной транзакции: создаётся `PriceList`, для каждой строки —
 *     upsert `CatalogItem` по (manufacturerId, sku). Категория — `pumps`,
 *     цена перезаписывается (без истории).
 *  4. Выводится отчёт: принято / отклонено.
 *
 * Повторный запуск не плодит дубли — upsert по уникальному [manufacturerId, sku].
 */
import { basename } from 'node:path';
import { db } from '../src/server/db';
import { importCnpCsv } from '../src/lib/catalog/import/cnp-csv';
import { importWellmixPdf } from '../src/lib/catalog/import/wellmix-pdf';
import { importPriceRowSchema } from '../src/lib/catalog/import/types';
import type { ImportPriceRow, ImportResult } from '../src/lib/catalog/import/types';

const CATEGORY = 'pumps';

function fail(msg: string): never {
  console.error(`Ошибка: ${msg}`);
  process.exit(1);
}

/** Разбирает файл прайса выбранным адаптером. */
function runAdapter(adapter: string, filePath: string): ImportResult {
  switch (adapter) {
    case 'cnp': {
      const { readFileSync } = require('node:fs') as typeof import('node:fs');
      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        fail(`не удалось прочитать файл «${filePath}»`);
      }
      return importCnpCsv(content, basename(filePath));
    }
    case 'wellmix':
      try {
        return importWellmixPdf(filePath, basename(filePath));
      } catch (e) {
        fail(`не удалось разобрать PDF «${filePath}»: ${e instanceof Error ? e.message : e}`);
      }
    // eslint-disable-next-line no-fallthrough
    default:
      fail(`неизвестный адаптер «${adapter}». Доступно: cnp, wellmix`);
  }
}

async function main(): Promise<void> {
  const [adapter, filePath] = process.argv.slice(2);
  if (!adapter || !filePath) {
    fail(
      'использование: tsx scripts/import-price.ts <adapter> <path>\n' +
        '  доступные адаптеры: cnp, wellmix',
    );
  }

  const result = runAdapter(adapter, filePath);
  const { meta, rejected } = result;

  // Валидация строк через zod.
  const accepted: ImportPriceRow[] = [];
  let zodRejected = 0;
  for (const row of result.rows) {
    const res = importPriceRowSchema.safeParse(row);
    if (res.success) {
      accepted.push(res.data);
    } else {
      zodRejected++;
      const issue = res.error.issues[0];
      console.warn(`  отклонено zod: ${row.sku} — ${issue?.path.join('.')}: ${issue?.message}`);
    }
  }

  // Производитель должен существовать (создан сидом).
  const manufacturer = await db.manufacturer.findUnique({ where: { name: meta.manufacturer } });
  if (!manufacturer) {
    fail(`производитель «${meta.manufacturer}» не найден в БД (выполните prisma db seed)`);
  }
  const category = await db.productCategory.findUnique({ where: { code: CATEGORY } });
  if (!category) {
    fail(`категория «${CATEGORY}» не найдена в БД (выполните prisma db seed)`);
  }

  const priceDate = new Date(meta.priceDate);

  // Транзакция: PriceList + upsert всех позиций.
  await db.$transaction(
    async (tx) => {
      await tx.priceList.create({
        data: {
          manufacturerId: manufacturer.id,
          title: meta.title,
          sourceFile: meta.sourceFile,
          currency: meta.currency,
          priceDate,
          rowCount: accepted.length,
        },
      });

      for (const row of accepted) {
        const attributes = {
          series: row.series,
          ...(row.powerKw !== undefined ? { powerKw: row.powerKw } : {}),
        };
        await tx.catalogItem.upsert({
          where: { manufacturerId_sku: { manufacturerId: manufacturer.id, sku: row.sku } },
          update: {
            name: row.name,
            categoryCode: CATEGORY,
            attributes,
            price: row.price,
            currency: row.currency,
            priceDate,
            active: true,
          },
          create: {
            manufacturerId: manufacturer.id,
            categoryCode: CATEGORY,
            sku: row.sku,
            name: row.name,
            attributes,
            price: row.price,
            currency: row.currency,
            priceDate,
            active: true,
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  const withPower = accepted.filter((r) => r.powerKw !== undefined).length;
  const total = await db.catalogItem.count({ where: { manufacturerId: manufacturer.id } });

  console.log('');
  console.log(`=== Импорт прайса ${meta.manufacturer} ===`);
  console.log(`  Файл:                 ${filePath}`);
  console.log(`  Строк разобрано:      ${result.rows.length + rejected.length}`);
  console.log(`  Принято:              ${accepted.length}`);
  console.log(`  Отклонено (парсер):   ${rejected.length}`);
  console.log(`  Отклонено (zod):      ${zodRejected}`);
  if (accepted.length > 0) {
    console.log(
      `  С мощностью powerKw:  ${withPower} (${((withPower / accepted.length) * 100).toFixed(1)}%)`,
    );
  }
  console.log(`  CatalogItem (${meta.manufacturer}): ${total}`);
  if (rejected.length > 0) {
    console.log('');
    console.log('  Примеры отклонённых строк (парсер):');
    rejected.slice(0, 8).forEach((r) => {
      console.log(`    стр.${r.line}: ${r.reason} — ${r.raw}`);
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
