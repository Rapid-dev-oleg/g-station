/**
 * Засев семейств продукции G-* (SystemType + стартовая схема ввода) по дереву
 * типов. Модель: СЕМЕЙСТВО = тип; сценарий/конструктив = enum-поля схемы.
 *
 * Идемпотентно и БЕЗОПАСНО к правкам: если у типа уже есть активная схема —
 * НЕ трогаем ни идентичность, ни схему (правки инженера целы). Первый прогон
 * заводит тип + активную схему v1; последующие — пропуск.
 *
 * Статус типов — PLANNED: не мешают fire-пилоту (парсер/ /calc/new берут READY).
 * Инженер ревьюит схему в конструкторе и переводит тип в READY, когда готов.
 *
 * fire НЕ здесь — у него своя проверенная схема (prisma/seed.ts + fire-fields.ts).
 * Запуск: npx tsx scripts/seed-type-schemas.ts
 */
import { db } from '@/server/db';
import type { FieldSpec } from '@/lib/schema/types';
import { POWER_FIELDS, WATER_FIELDS, LNS_FIELDS, KNS_FIELDS } from '@/lib/schema/starter-fields';

interface SeedType {
  code: string;
  name: string;
  description: string;
  triggers: string[];
  purposes: string[];
  components: string[];
  fields: FieldSpec[];
}

const TYPES: SeedType[] = [
  {
    code: 'power',
    name: 'Спецсистемы G-POWER',
    description: 'Спецсистемы: совмещённая (хоз-пит + пожар), гидромодули, нестандартные спецстанции.',
    triggers: ['гидромодуль', 'спецстанц', 'совмещённая станция', 'хоз-пит + пожар', 'повысительн'],
    purposes: ['совмещённая-хозпит-пожар', 'гидромодули', 'нестандартные-спецстанции'],
    components: ['жокей', 'шкаф управлен', 'ШУ', 'коллектор', 'бак', 'обвязк'],
    fields: POWER_FIELDS,
  },
  {
    code: 'water',
    name: 'Водоснабжение G-WATER',
    description: 'Хозяйственно-питьевое водоснабжение, повышение давления.',
    triggers: ['хоз-питьевое', 'водоснабжение', 'повышение давления', 'ХВС', 'питьевая вода'],
    purposes: ['хозяйственно-питьевая', 'повышение-давления'],
    components: ['жокей', 'шкаф управлен', 'ШУ', 'коллектор', 'бак', 'обвязк'],
    fields: WATER_FIELDS,
  },
  {
    code: 'lns',
    name: 'Ливневая насосная станция (ЛНС)',
    description: 'Ливневые насосные станции: общего назначения, совмещённые с ЛОС.',
    triggers: ['ливнев', 'ЛНС', 'дождев', 'ливневая канализац', 'ЛОС'],
    purposes: ['общего-назначения', 'совмещённая-с-ЛОС'],
    components: ['шкаф управлен', 'ШУ', 'трубопровод', 'запорн', 'датчик уровня'],
    fields: LNS_FIELDS,
  },
  {
    code: 'kns',
    name: 'Канализационная насосная станция (КНС)',
    description: 'Канализационные насосные станции общего назначения.',
    triggers: ['КНС', 'канализац', 'хозбытов', 'сточн', 'фекальн'],
    purposes: ['общего-назначения'],
    components: ['шкаф управлен', 'ШУ', 'трубопровод', 'запорн', 'датчик уровня'],
    fields: KNS_FIELDS,
  },
];

async function seedType(t: SeedType): Promise<void> {
  const activeCount = await db.typeSchema.count({ where: { typeCode: t.code, status: 'active' } });
  if (activeCount > 0) {
    console.log(`${t.code}: уже есть активная схема — не трогаю (правки целы).`);
    return;
  }

  const identity = {
    name: t.name,
    description: t.description,
    skillName: 'pump-station-calc',
    schemaRef: 'расчётное-дело.schema.json',
    status: 'PLANNED' as const,
    triggers: t.triggers,
    purposes: t.purposes,
    components: t.components,
  };
  await db.systemType.upsert({
    where: { code: t.code },
    update: identity, // безопасно: сюда попали только типы без активной схемы (нетронутые)
    create: { code: t.code, ...identity },
  });

  const max = await db.typeSchema.aggregate({ where: { typeCode: t.code }, _max: { version: true } });
  const version = (max._max.version ?? 0) + 1;
  await db.typeSchema.create({
    data: { typeCode: t.code, version, fields: t.fields as object, status: 'active', note: 'стартовая схема (дерево продукции)' },
  });
  console.log(`${t.code}: заведён тип + активная схема v${version} (${t.fields.length} полей).`);
}

async function main() {
  for (const t of TYPES) await seedType(t);
  console.log('✓ Засев семейств продукции завершён.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
