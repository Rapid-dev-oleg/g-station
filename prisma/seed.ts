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

  // 3.9-A v2 — матрица 12 зон выбора класса насоса по Q_per_pump × H × footprint.
  // Эквивалент DEFAULT_PUMP_CLASS_RULE в src/lib/engine/calc/pump-class.ts.
  // update применяется явно — для синхронизации БД с TS-fallback при правках.
  const pumpClassV2Payload = {
    ruleId: '3.9-A-pump-class',
    version: 'v2',
    defaultZone: {
      classCode: 'END_SUCTION',
      construction: 'консольный моноблочный (универсальный)',
      seriesHint: 'CNP NIS',
    },
    zones: [
      { id: 'split-case-large-q', qppMin: 400, classCode: 'SPLIT_CASE', construction: 'двусторонний всас (сплит-кейс)', seriesHint: 'CNP SMM / Д320', rpm: 1450 },
      { id: 'h-gt-100-q-gt-200', hMin: 100, qppMin: 200, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый (высокий напор, крупный расход)', seriesHint: 'CNP NIS / NES / NM', rpm: 2900 },
      { id: 'h-gt-100-q-le-200', hMin: 100, qppMax: 200, classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый (высокий напор)', seriesHint: 'CNP CDM / CDMF / CV', rpm: 2900 },
      { id: 'h-80-100-q-ge-90-no-vert', hMin: 80, hMax: 100, qppMin: 90, requiresVertical: false, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый (крупный типоразмер 220–260 мм)', seriesHint: 'CNP NIS / NES / NM', rpm: 2900 },
      { id: 'h-80-100-q-ge-90-vert', hMin: 80, hMax: 100, qppMin: 90, requiresVertical: true, classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый (ТЗ-требование)', seriesHint: 'CNP CDM / CV', rpm: 2900 },
      { id: 'h-80-100-q-lt-90', hMin: 80, hMax: 100, qppMax: 90, classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый', seriesHint: 'CNP CDM / CV', rpm: 2900 },
      { id: 'h-50-80-q-ge-90', hMin: 50, hMax: 80, qppMin: 90, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый', seriesHint: 'CNP NIS / NES / NM', rpm: 2900 },
      { id: 'h-50-80-q-lt-90', hMin: 50, hMax: 80, qppMax: 90, classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый', seriesHint: 'CNP CDM / CV', rpm: 2900 },
      { id: 'h-30-50-q-ge-100', hMin: 30, hMax: 50, qppMin: 100, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый', seriesHint: 'CNP NIS / NES / NBW', rpm: 2900 },
      { id: 'h-30-50-q-50-100-vert', hMin: 30, hMax: 50, qppMin: 50, qppMax: 100, requiresVertical: true, classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый (ТЗ-референс типа Wilo MVL)', seriesHint: 'CNP CDM / CV', rpm: 2900 },
      { id: 'h-30-50-q-50-100-tight', hMin: 30, hMax: 50, qppMin: 50, qppMax: 100, footprintIn: ['tight'], classCode: 'IN_LINE', construction: 'ин-лайн (компромисс, тесная площадка)', seriesHint: 'CNP TD', rpm: 2900 },
      { id: 'h-30-50-q-50-100-spacious', hMin: 30, hMax: 50, qppMin: 50, qppMax: 100, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый (просторная площадка)', seriesHint: 'CNP NIS / NES', rpm: 2900 },
      { id: 'h-30-50-q-lt-50-tight', hMin: 30, hMax: 50, qppMax: 50, footprintIn: ['tight'], classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый (тесная площадка)', seriesHint: 'CNP CDM', rpm: 2900 },
      { id: 'h-30-50-q-lt-50-spacious', hMin: 30, hMax: 50, qppMax: 50, footprintIn: ['spacious'], classCode: 'IN_LINE', construction: 'ин-лайн (просторная площадка)', seriesHint: 'CNP TD', rpm: 2900 },
      { id: 'h-30-50-q-lt-50-any', hMin: 30, hMax: 50, qppMax: 50, footprintIn: ['any'], classCode: 'MULTISTAGE', construction: 'вертикальный многоступенчатый (типовой для пожарной серой зоны)', seriesHint: 'CNP CDM', rpm: 2900 },
      { id: 'h-20-30-q-ge-50', hMin: 20, hMax: 30, qppMin: 50, classCode: 'END_SUCTION', construction: 'консольный одноступенчатый', seriesHint: 'CNP NIS / NES / NBW / BL', rpm: 2900 },
      { id: 'h-20-30-q-lt-50', hMin: 20, hMax: 30, qppMax: 50, classCode: 'IN_LINE', construction: 'вертикальный ин-лайн одноступенчатый', seriesHint: 'CNP TD / IL / IPN', rpm: 2900 },
      { id: 'h-lt-20-q-ge-50', hMax: 20, qppMin: 50, classCode: 'END_SUCTION', construction: 'консольный низконапорный (большой расход)', seriesHint: 'CNP NIS / NES / NBW', rpm: 2900 },
      { id: 'h-lt-20-q-lt-50-tight', hMax: 20, qppMax: 50, footprintIn: ['tight'], classCode: 'END_SUCTION', construction: 'консольный компактный (подземка)', seriesHint: 'CNP NES65-50 / NBW', rpm: 2900 },
      { id: 'h-lt-20-q-lt-50-spacious', hMax: 20, qppMax: 50, footprintIn: ['spacious'], classCode: 'IN_LINE', construction: 'ин-лайн (просторная площадка)', seriesHint: 'CNP TD / IL / IPN', rpm: 2900 },
      { id: 'h-lt-20-q-lt-50-any', hMax: 20, qppMax: 50, footprintIn: ['any'], classCode: 'END_SUCTION', construction: 'консольный компактный (универсальный для малой подземной)', seriesHint: 'CNP NES65-50', rpm: 2900 },
    ],
  };
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '3.9-A-pump-class', version: 'v2' } },
    update: { payload: pumpClassV2Payload },
    create: {
      ruleId: '3.9-A-pump-class',
      version: 'v2',
      notes:
        'Матрица класса насоса по Q_per_pump × H × footprint (KNOWLEDGE §3.9-A v2). Изменения v2: H>100 (было >80), H 80-100 промежуток с разводкой по vert, серая зона H<20+Q<50 с разводкой по площадке. После задачи #11: серая зона H 30-50 Q<50 «any» → MULTISTAGE (типовой выбор инженера).',
      payload: pumpClassV2Payload,
    },
  });

  // 3.10 v1 — карта аналогов брендов (Wilo / Grundfos / ... → CNP).
  // Эквивалент DEFAULT_BRAND_MAP_RULE в src/lib/engine/calc/brand-map.ts.
  await db.ruleConfig.upsert({
    where: { ruleId_version: { ruleId: '3.10-brand-map', version: 'v1' } },
    update: {},
    create: {
      ruleId: '3.10-brand-map',
      version: 'v1',
      notes:
        'Карта аналогов брендов (KB §3.10). 5 групп: MULTISTAGE верт., SPLIT_CASE, IN_LINE, END_SUCTION, MULTISTAGE гориз. Применяется ДО матрицы 3.9-A как часть «физики ТЗ».',
      payload: {
        ruleId: '3.10-brand-map',
        version: 'v1',
        entries: [
          { id: 'multistage-vertical', matches: ['MVL', 'MVI', 'MVC', 'Grundfos CR', ' CR ', 'CR-', 'Wellmix CV', 'CV-', 'ANTARUS MLV'], classCode: 'MULTISTAGE', cnpSeries: 'CNP CDM / CDMF', construction: 'вертикальный многоступенчатый (аналог 3.10)' },
          { id: 'split-case', matches: ['Wilo SCP', ' SCP ', 'SCP-', 'LS-HSC', 'Grundfos LS', 'СПЛИТ', 'SPLIT'], classCode: 'SPLIT_CASE', cnpSeries: 'CNP SMM', construction: 'двусторонний всас (сплит-кейс, аналог 3.10)' },
          { id: 'in-line', matches: ['Wilo IL', 'Wilo IPN', 'Grundfos TP', ' TP ', 'TP-', 'IN-LINE', 'ин-лайн'], classCode: 'IN_LINE', cnpSeries: 'CNP TD', construction: 'вертикальный ин-лайн одноступенчатый (аналог 3.10)' },
          { id: 'end-suction', matches: ['Wilo NL', 'Wilo BL', ' BL ', 'BL-', 'Grundfos NK', ' NK ', 'NK-', 'Masdaf NM', ' NM ', 'NM-', 'aikon NES', 'NES65', 'NES80', 'NES100', 'Wellmix NBW', 'NBW', 'NKW'], classCode: 'END_SUCTION', cnpSeries: 'CNP NIS / NES', construction: 'консольный одноступенчатый end-suction (аналог 3.10)' },
          { id: 'multistage-horizontal', matches: ['LEO ECH', ' ECH ', 'ECH-', 'Wellmix CUC', ' CUC ', 'CNP CHL', ' CHL '], classCode: 'MULTISTAGE', cnpSeries: 'Wellmix CUC / CNP CHL', construction: 'горизонтальный многоступенчатый (аналог 3.10)' },
        ],
      },
    },
  });

  console.log('Сид выполнен: admin, типы систем, категории, производители, нормы, настройки, правила.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
