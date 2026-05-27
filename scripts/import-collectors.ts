/**
 * CLI импорта прайса коллекторов и обвязки жокей-насоса Гидрострой G-Fire.
 *
 * Использование:
 *   tsx scripts/import-collectors.ts <путь-к-xlsx>
 *
 * Логика:
 *  1. Парсер `importGfireCollectorsXlsx` разбирает файл → секции
 *     «нержавеющая» и «углеродистая» + блок обвязки жокея.
 *  2. В одной транзакции: создаётся `PriceList` производителя
 *     «Гидрострой-НН», upsert `CatalogItem` по (manufacturerId, sku):
 *        category=collectors:    GF-COL-{N|C}-<config-без-слешей>
 *        category=jockey-piping: GF-JKIT-<LP|MP|HP по давлению>
 *  3. Стоимость расключения жокей-установки сохраняется в attributes
 *     парных позиций jockey-piping (поле routingCost) — не отдельной строкой.
 *  4. Повторный запуск не плодит дубли (upsert).
 */

import { Prisma } from '@prisma/client';
import { db } from '../src/server/db';
import { importGfireCollectorsXlsx } from '../src/lib/catalog/import/gfire-collectors-xlsx';
import type {
  CollectorImportResult,
  CollectorRow,
  JockeyKitRow,
} from '../src/lib/catalog/import/gfire-collectors-xlsx';

const MANUFACTURER = 'Гидрострой-НН';
const CATEGORY_COLLECTORS = 'collectors';
const CATEGORY_JOCKEY = 'jockey-piping';
const CURRENCY = 'RUB';

function fail(msg: string): never {
  console.error(`Ошибка: ${msg}`);
  process.exit(1);
}

/** SKU коллектора: `GF-COL-{N|C}-100x80-2-65x40` (слеш заменяем на «x» для безопасности). */
function collectorSku(row: CollectorRow): string {
  const matCode = row.material === 'нержавеющая-сталь' ? 'N' : 'C';
  const safeConfig = row.config.raw.replace(/\//g, 'x');
  return `GF-COL-${matCode}-${safeConfig}`;
}

/** Человекочитаемое название позиции. */
function collectorName(row: CollectorRow): string {
  const matLabel = row.material === 'нержавеющая-сталь' ? 'нержа' : 'черняга';
  return `Коллектор Gfire (${matLabel}) ${row.config.raw}`;
}

/** Короткий код давления для SKU обвязки жокея. */
function jockeyPressureCode(pMax: number): string {
  if (pMax <= 1.0) return 'LP';     // low (≤1,0 МПа)
  if (pMax <= 1.6) return 'MP';     // medium (1,0…1,6 МПа)
  return 'HP';                       // high (для будущих диапазонов)
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    fail('использование: tsx scripts/import-collectors.ts <path-to-xlsx>');
  }

  let parsed: CollectorImportResult;
  try {
    parsed = await importGfireCollectorsXlsx(filePath);
  } catch (e) {
    fail(`не удалось разобрать «${filePath}»: ${e instanceof Error ? e.message : e}`);
  }

  if (parsed.collectors.length === 0 && parsed.jockeyKits.length === 0) {
    fail('файл разобран, но не найдено ни одной позиции коллектора или обвязки жокея');
  }

  const manufacturer = await db.manufacturer.findUnique({ where: { name: MANUFACTURER } });
  if (!manufacturer) {
    fail(`производитель «${MANUFACTURER}» не найден в БД (выполните: npx prisma db seed)`);
  }
  for (const code of [CATEGORY_COLLECTORS, CATEGORY_JOCKEY]) {
    const cat = await db.productCategory.findUnique({ where: { code } });
    if (!cat) fail(`категория «${code}» не найдена в БД (выполните: npx prisma db seed)`);
  }

  const priceDate = parsed.priceDate;
  const totalRows = parsed.collectors.length + parsed.jockeyKits.length;

  await db.$transaction(
    async (tx) => {
      await tx.priceList.create({
        data: {
          manufacturerId: manufacturer.id,
          title: 'Коллекторы G-Fire + обвязка жокея',
          sourceFile: parsed.sourceFile,
          currency: CURRENCY,
          priceDate,
          rowCount: totalRows,
        },
      });

      // Коллекторы.
      for (const row of parsed.collectors) {
        const sku = collectorSku(row);
        const attributes = {
          config: row.config.raw,
          material: row.material,
          dn_suction: row.config.dnSuction,
          dn_discharge: row.config.dnDischarge,
          n_pumps: row.config.nPumps,
          dn_nozzle_suction: row.config.dnNozzleSuction,
          dn_nozzle_discharge: row.config.dnNozzleDischarge,
          cost_materials: row.costMaterials,
          cost_work_collector: row.costWorkCollector,
          cost_work_frame: row.costWorkFrame,
          cost_work_routing: row.costWorkRouting,
        };
        await tx.catalogItem.upsert({
          where: { manufacturerId_sku: { manufacturerId: manufacturer.id, sku } },
          update: {
            name: collectorName(row),
            categoryCode: CATEGORY_COLLECTORS,
            attributes,
            price: row.priceTotal,
            currency: CURRENCY,
            priceDate,
            active: true,
          },
          create: {
            manufacturerId: manufacturer.id,
            categoryCode: CATEGORY_COLLECTORS,
            sku,
            name: collectorName(row),
            attributes,
            price: row.priceTotal,
            currency: CURRENCY,
            priceDate,
            active: true,
          },
        });
      }

      // Обвязка жокея — каждому варианту давления своя позиция.
      // Стоимость расключения добавляется в attributes (как описано в шапке файла).
      for (const kit of parsed.jockeyKits) {
        const code = jockeyPressureCode(kit.pressureMaxMpa);
        const sku = `GF-JKIT-${code}`;
        const attributes: Prisma.InputJsonObject = {
          pressure_max_mpa: kit.pressureMaxMpa,
          label: kit.label,
          ...(parsed.jockeyRouting != null ? { routing_cost: parsed.jockeyRouting } : {}),
        };

        await tx.catalogItem.upsert({
          where: { manufacturerId_sku: { manufacturerId: manufacturer.id, sku } },
          update: {
            name: `Обвязка жокей-насоса ${kit.label}`,
            categoryCode: CATEGORY_JOCKEY,
            attributes,
            price: kit.priceTotal,
            currency: CURRENCY,
            priceDate,
            active: true,
          },
          create: {
            manufacturerId: manufacturer.id,
            categoryCode: CATEGORY_JOCKEY,
            sku,
            name: `Обвязка жокей-насоса ${kit.label}`,
            attributes,
            price: kit.priceTotal,
            currency: CURRENCY,
            priceDate,
            active: true,
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  const nerza = parsed.collectors.filter((c) => c.material === 'нержавеющая-сталь').length;
  const chern = parsed.collectors.filter((c) => c.material === 'углеродистая-сталь').length;
  const totalDb = await db.catalogItem.count({
    where: { manufacturerId: manufacturer.id, categoryCode: { in: [CATEGORY_COLLECTORS, CATEGORY_JOCKEY] } },
  });

  console.log('');
  console.log(`=== Импорт прайса коллекторов «${MANUFACTURER}» ===`);
  console.log(`  Файл:                 ${filePath}`);
  console.log(`  Дата прайса:          ${priceDate.toISOString().slice(0, 10)} (по mtime)`);
  console.log(`  Коллекторов принято:  ${parsed.collectors.length}  (нержа ${nerza} / черняга ${chern})`);
  console.log(`  Обвязок жокея:        ${parsed.jockeyKits.length}`);
  if (parsed.jockeyRouting != null) {
    console.log(`  Расключение жокея:    ${parsed.jockeyRouting.toFixed(2)} ₽ (в attributes.routing_cost)`);
  }
  console.log(`  Отклонено:            ${parsed.rejected.length}`);
  console.log(`  CatalogItem (collectors+jockey-piping): ${totalDb}`);
  if (parsed.rejected.length > 0) {
    console.log('');
    console.log('  Примеры отклонённых строк:');
    parsed.rejected.slice(0, 8).forEach((r) => {
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
