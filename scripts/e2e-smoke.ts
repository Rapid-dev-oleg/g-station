/**
 * E2E-smoke: создаёт клиента, проект, систему с готовым dossier из фикстуры,
 * вызывает движок через runCalculationWithDbCatalog (БД-каталог + правила),
 * проверяет что результат записан и гейты сформированы.
 *
 * Запуск: tsx scripts/e2e-smoke.ts [anohin-01]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dossier } from '@/lib/dossier/types';
import { db } from '@/server/db';
import { runCalculationWithDbCatalog } from '@/server/engine-runner';

async function main(): Promise<void> {
  const caseId = process.argv[2] || 'anohin-07';
  const fixturePath = join(process.cwd(), `src/lib/dossier/fixtures/cases/${caseId}.json`);
  const dossier = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Dossier;

  console.log(`=== E2E smoke: ${caseId} ===\n`);

  // 1) Клиент
  const client = await db.client.upsert({
    where: { id: 'e2e-smoke-client' },
    update: { shortName: 'E2E-Smoke Test' },
    create: {
      id: 'e2e-smoke-client',
      shortName: 'E2E-Smoke Test',
      fullName: 'ООО «Smoke Test для проверки расчёта»',
    },
  });
  console.log(`[1] Client: ${client.shortName} (${client.id})`);

  // 2) Owner
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
  console.log(`[2] Owner: ${owner.email}`);

  // 3) Project
  const project = await db.project.upsert({
    where: { id: 'e2e-smoke-project' },
    update: { name: `E2E ${caseId}`, objectName: caseId },
    create: {
      id: 'e2e-smoke-project',
      name: `E2E ${caseId}`,
      objectName: caseId,
      clientId: client.id,
      ownerId: owner.id,
    },
  });
  console.log(`[3] Project: ${project.name} (${project.id})`);

  // 4) System
  const system = await db.system.upsert({
    where: { id: 'e2e-smoke-system' },
    update: {
      name: `Станция ${caseId}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dossier: dossier as any,
      typeCode: 'fire',
    },
    create: {
      id: 'e2e-smoke-system',
      name: `Станция ${caseId}`,
      typeCode: 'fire',
      projectId: project.id,
      engineerId: owner.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dossier: dossier as any,
    },
  });
  console.log(`[4] System: ${system.name} (${system.id})`);

  // 5) Расчёт
  console.log(`\n[5] Запуск расчёта через runCalculationWithDbCatalog…`);
  const t0 = Date.now();
  const result = await runCalculationWithDbCatalog(dossier);
  const ms = Date.now() - t0;
  console.log(`    OK за ${ms} мс. Гейтов: ${result.gates.length}.`);

  // 6) Результаты
  const station = result.dossier.stations[0];
  const variant = station.variants?.[station.output?.selected_variant ?? 0];
  console.log(`\n[6] Результат станции #1:`);
  console.log(`    Q_target = ${station.calc?.Q_target?.value} ${station.calc?.Q_target?.unit}`);
  console.log(`    H_target = ${station.calc?.H_target?.value} ${station.calc?.H_target?.unit}`);
  console.log(
    `    Working point = ${station.calc?.working_point?.Q?.value} м³/ч / ${station.calc?.working_point?.H?.value} м`,
  );
  console.log(
    `    Pump motor    = ${variant?.equipment?.main_pump?.motor_power?.value} кВт (qty ${variant?.equipment?.main_pump?.qty})`,
  );
  console.log(`    Collector     = ${variant?.equipment?.collector?.code} / ${variant?.equipment?.collector?.material}`);
  console.log(`    ШУ            = ${variant?.equipment?.control_cabinet?.brand} ${variant?.equipment?.control_cabinet?.series}`);
  console.log(`    Code          = ${station.output?.product_code}`);
  console.log(`    Total cost    = ${variant?.pricing?.total_cost} ₽`);
  console.log(`    Client price  = ${variant?.pricing?.client_price} ₽ (markup ${variant?.pricing?.markup_coefficient})`);
  console.log(`    Validation    = [${(station.output?.validation_flags ?? []).join(', ') || 'нет флагов'}]`);

  // 7) Гейты
  console.log(`\n[7] Гейты (короткая сводка):`);
  for (const g of result.gates) {
    console.log(`    Гейт ${g.gate} / станция ${g.stationIndex}: ${g.items.length} пунктов, clear=${g.clear}`);
  }

  console.log(`\n✓ E2E прошёл без ошибок.`);
}

main()
  .catch((e) => {
    console.error('\n✗ E2E упал:');
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
