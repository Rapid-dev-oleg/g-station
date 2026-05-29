import { db } from '@/server/db';
import { runCalculationWithDbCatalog } from '@/server/engine-runner';
import { readFileSync } from 'node:fs';
import type { Dossier } from '@/lib/dossier/types';

async function main(): Promise<void> {
  const caseId = process.argv[2] || 'anohin-07';
  const d = JSON.parse(
    readFileSync(`src/lib/dossier/fixtures/cases/${caseId}.json`, 'utf-8'),
  ) as Dossier;
  const r = await runCalculationWithDbCatalog(d);
  const v = r.dossier.stations[0].variants?.[0];
  console.log(`=== pricing rows for ${caseId} ===`);
  for (const row of v?.pricing?.rows ?? []) {
    console.log(
      `  ${(row.position_group ?? '').padEnd(12)} price=${String(row.price ?? 0).padStart(10)} ${row.currency ?? 'RUB'} x${row.qty} => purchase=${row.purchase_cost}  | ${row.position_name}${row.price_note ? ` // ${row.price_note}` : ''}`,
    );
  }
  console.log('total_cost:', v?.pricing?.total_cost);
  console.log('validation:', r.dossier.stations[0].output?.validation_flags);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
