/**
 * Сид БД: ADMIN-пользователь, типы систем, категории каталога,
 * производители, нормативы, настройки.
 * Запуск: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  // ── ADMIN ──
  await db.user.upsert({
    where: { email: 'admin@gidrostroy.local' },
    update: {},
    create: {
      email: 'admin@gidrostroy.local',
      name: 'Администратор',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'ADMIN',
    },
  });

  // ── Типы систем ──
  const types = [
    { code: 'fire', name: 'Пожарная система', status: 'READY' as const,
      description: 'Насосные станции пожаротушения (G-Fire): ВПВ, АУПТ, наружное ПТ.' },
    { code: 'water', name: 'Водоснабжение', status: 'PLANNED' as const,
      description: 'Хоз-питьевое водоснабжение, повышение давления.' },
    { code: 'power', name: 'Прочие', status: 'PLANNED' as const, description: null },
  ];
  for (const t of types) {
    await db.systemType.upsert({ where: { code: t.code }, update: { name: t.name, status: t.status }, create: t });
  }

  // ── Категории каталога ──
  const categories = [
    { code: 'pumps', name: 'Насосы' },
    { code: 'panels', name: 'Шкафы управления' },
    { code: 'collectors', name: 'Коллекторы' },
    { code: 'reservoirs', name: 'Резервуары' },
    { code: 'works', name: 'Работы' },
    { code: 'accessories', name: 'Аксессуары' },
    { code: 'vfd', name: 'Частотные преобразователи' },
    { code: 'jockey-piping', name: 'Обвязка жокей-насоса' },
  ];
  for (const c of categories) {
    await db.productCategory.upsert({ where: { code: c.code }, update: { name: c.name }, create: c });
  }

  // ── Производители ──
  for (const name of ['CNP', 'Wilo', 'Wellmix', 'Шторм', 'Омега', 'ВАРПЛАСТ', 'Гидрострой-НН']) {
    await db.manufacturer.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ── Нормативы ──
  const norms = [
    { code: 'СП 10.13130.2020', title: 'Внутренний противопожарный водопровод', category: 'пожаротушение' },
    { code: 'СП 8.13130.2020', title: 'Наружное противопожарное водоснабжение', category: 'пожаротушение' },
    { code: 'СП 485.1311500.2020', title: 'Установки пожаротушения автоматические', category: 'пожаротушение' },
    { code: 'СП 31.13330.2021', title: 'Водоснабжение. Наружные сети и сооружения', category: 'гидравлика' },
    { code: 'ГОСТ 17376', title: 'Тройники стальные бесшовные', category: 'трубопроводы' },
  ];
  for (const n of norms) {
    await db.norm.upsert({ where: { code: n.code }, update: { title: n.title }, create: n });
  }

  // ── Настройки ──
  await db.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      companyName: 'ООО «Гидрострой-НН»',
      defaultRateUsd: 90,
      defaultRateCny: 13,
      defaultMarkup: 1.7,
    },
  });

  // ── Правила (RuleConfig) ──
  // 5.7 v1 — материал коллектора. Эквивалент fallback в fire.ts.
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '5.7-material', version: 'v1' } },
    update: { active: false }, // деактивируем v1: latest active = v2
    create: {
      ruleId: '5.7-material',
      version: 'v1',
      active: false,
      notes: 'Материал коллектора: углеродистая по умолчанию; нержавейка при подземном (HARD-a). Заменён v2.',
      payload: {
        ruleId: '5.7-material',
        version: 'v1',
        defaults: {
          material: 'углеродистая-сталь',
          pipeSpec: 'углеродистая сталь Ст.20 (ГОСТ 10704-91)',
        },
        triggers: [
          {
            id: 'hard-a-underground',
            when: {
              anyOf: [
                {
                  field: 'station_enclosure',
                  in: ['подземное-стеклопластик', 'стеклопластиковый-колодец'],
                },
                { field: 'installation_place', equals: 'заглублённая' },
              ],
            },
            then: {
              material: 'нержавеющая-сталь',
              pipeSpec: 'нержавеющая сталь AISI 304',
            },
          },
        ],
      },
    },
  });

  // 5.7 v2 — расширенные триггеры: a (подземное), b (ТЗ-нерж), c (питьевая среда).
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '5.7-material', version: 'v2' } },
    update: {},
    create: {
      ruleId: '5.7-material',
      version: 'v2',
      notes:
        'Триггеры HARD: a (подземное), b (ТЗ-нерж явно), c (питьевая среда). Иначе — углеродистая.',
      payload: {
        ruleId: '5.7-material',
        version: 'v2',
        defaults: {
          material: 'углеродистая-сталь',
          pipeSpec: 'углеродистая сталь Ст.20 (ГОСТ 10704-91)',
        },
        triggers: [
          {
            id: 'hard-b-tz-required',
            when: {
              anyOf: [{ field: 'collector_material', equals: 'нержавеющая-сталь' }],
            },
            then: {
              material: 'нержавеющая-сталь',
              pipeSpec: 'нержавеющая сталь AISI 304 (требование ТЗ)',
            },
          },
          {
            id: 'hard-a-underground',
            when: {
              anyOf: [
                {
                  field: 'station_enclosure',
                  in: ['подземное-стеклопластик', 'стеклопластиковый-колодец'],
                },
                { field: 'installation_place', equals: 'заглублённая' },
              ],
            },
            then: {
              material: 'нержавеющая-сталь',
              pipeSpec: 'нержавеющая сталь AISI 304',
            },
          },
          {
            id: 'hard-c-potable',
            when: {
              anyOf: [
                { field: 'purpose', equals: 'хоз-питьевое' },
                { field: 'pumping_medium.medium', equals: 'питьевая' },
              ],
            },
            then: {
              material: 'нержавеющая-сталь',
              pipeSpec: 'нержавеющая сталь AISI 304 (питьевая среда)',
            },
          },
        ],
      },
    },
  });

  // 5.1 v2 — DN коллектора по расходу станции (порог запаса 80 %).
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '5.1-collector-dn-by-flow', version: 'v2' } },
    update: {},
    create: {
      ruleId: '5.1-collector-dn-by-flow',
      version: 'v2',
      notes:
        'DN коллектора от расхода станции (СП 31.13330). Запас: при Q ≥ 80 % верхней границы диапазона DN → следующий типоразмер.',
      payload: {
        ruleId: '5.1-collector-dn-by-flow',
        version: 'v2',
        reserveThreshold: 0.8,
      },
    },
  });

  // 5.3 v3 — floor по патрубку и запас по числу насосов.
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '5.3-collector-floor', version: 'v3' } },
    update: {},
    create: {
      ruleId: '5.3-collector-floor',
      version: 'v3',
      notes:
        'Floor +1 типоразмер только для патрубков ≤ DN50 (правка после anohin-08: для DN ≥ 65 floor не применяется). Запас +1 при числе насосов ≥ 4 (правка после anohin-10 ВНС).',
      payload: {
        ruleId: '5.3-collector-floor',
        version: 'v3',
        smallNozzleDnMax: 50,
        smallNozzleSteps: 1,
        manyPumpsThreshold: 4,
        manyPumpsSteps: 1,
      },
    },
  });

  console.log('Сид выполнен: admin, типы систем, категории, производители, нормы, настройки, правила.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
