/**
 * Берёт застрявшую задачу парсинга, собирает dossier как autoSubmit и проверяет,
 * проходит ли валидацию ПОСЛЕ фикса scrubInput. Запуск:
 *   npx tsx scripts/check-parse-validation.ts <jobId>
 */
import { PrismaClient } from '@prisma/client';
import { createEmptyDossier } from '../src/lib/dossier/factory';
import { validateDossier } from '../src/lib/dossier/validate';
import { scrubInput, scrubMeta } from '../src/lib/dossier/scrub';

const db = new PrismaClient();
const jobId = process.argv[2] || 'cmpwlj9ek0004mqfl93iv2hwb';

(async () => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  const res = job?.result as any;
  const parsed = res?.result;
  if (!parsed?.systems?.length) {
    console.error('нет systems в задаче');
    process.exit(1);
  }
  for (const sys of parsed.systems) {
    const base = createEmptyDossier(sys.systemName || 'Система');
    const dossier = {
      meta: { ...base.meta, ...scrubMeta(parsed.meta) },
      stations: [
        { ...base.stations[0], input: { ...base.stations[0].input, ...scrubInput(sys.input) } },
      ],
    };
    const check = validateDossier(dossier);
    console.log(`\nСистема: ${sys.systemName}`);
    console.log('  reservation_scheme →', JSON.stringify(dossier.stations[0].input.reservation_scheme));
    console.log('  jockey_required →', JSON.stringify(dossier.stations[0].input.jockey_required));
    console.log('  collector_material →', JSON.stringify(dossier.stations[0].input.collector_material));
    console.log('  ВАЛИДНО:', check.valid);
    if (!check.valid) console.log('  ОШИБКИ:', check.errors.join(' | '));
  }
  await db.$disconnect();
  process.exit(0);
})();
