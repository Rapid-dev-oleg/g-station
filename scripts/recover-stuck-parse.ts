/**
 * Восстанавливает систему(ы) из застрявшей review-задачи парсинга в указанный
 * проект (после фикса scrubInput). Запуск:
 *   npx tsx scripts/recover-stuck-parse.ts <jobId> <projectId>
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { createEmptyDossier } from '../src/lib/dossier/factory';
import { validateDossier } from '../src/lib/dossier/validate';
import { scrubInput, scrubMeta } from '../src/lib/dossier/scrub';

const db = new PrismaClient();
const jobId = process.argv[2] || 'cmpwlj9ek0004mqfl93iv2hwb';
const projectId = process.argv[3] || 'cmpwlmej90006mqflcxi8s0hx';

(async () => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  const input = job?.input as any;
  const parsed = (job?.result as any)?.result;
  const ownerId = input?.ownerId as string | undefined;
  if (!parsed?.systems?.length) { console.error('нет systems'); process.exit(1); }

  for (const sys of parsed.systems) {
    const base = createEmptyDossier(sys.systemName || 'Система');
    const dossier: any = {
      meta: { ...base.meta, ...scrubMeta(parsed.meta) },
      stations: [{ ...base.stations[0], input: { ...base.stations[0].input, ...scrubInput(sys.input) } }],
    };
    const check = validateDossier(dossier);
    if (!check.valid) { console.error(`пропуск ${sys.systemName}: ${check.errors.join('; ')}`); continue; }
    const created = await db.system.create({
      data: {
        name: sys.systemName,
        projectId,
        typeCode: sys.typeCode,
        engineerId: ownerId,
        dossier: dossier as Prisma.InputJsonValue,
      },
    });
    console.log(`✅ создана система ${created.id} (${sys.systemName}) в проекте ${projectId}`);
  }
  await db.$disconnect();
  process.exit(0);
})();
