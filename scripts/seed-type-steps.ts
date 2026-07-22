/**
 * Засев шагов конвейера в TypeStep (шаги-как-данные) для готовых типов.
 * Идемпотентно: если у типа уже есть шаги — не трогаем (правки целы).
 * Запуск: npx tsx scripts/seed-type-steps.ts
 */
import { db } from '@/server/db';

type Step = { key: string; label: string; kind: string; directive?: string; file?: string; gate?: boolean };

const FIRE_STEPS: Step[] = [
  { key: 'input', label: 'Вход', kind: 'input', file: 'шаги/шаг1-вход.md' },
  {
    key: 'calc', label: 'Расчёт', kind: 'llm', file: 'шаги/шаг2-расчёт.md',
    directive: 'Выполни ШАГ 2 (расчёт) скила pump-station-calc: рабочая точка (Q_target, H_target, ' +
      'working_point с запасом 5–10 %), нормативный расчёт типа, схема резервирования, диаметр коллектора, ' +
      'оценка мощности двигателя, тип пуска, жокей. Кратко перечисли рассчитанные характеристики.',
  },
  {
    key: 'selection', label: 'Подбор', kind: 'llm', file: 'шаги/шаг3-подбор.md',
    directive: 'Выполни ШАГ 3 (подбор оборудования) по рассчитанным характеристикам: основной насос ' +
      '(класс/типоразмер/мощность — без точной модели, это решение инженера), жокей, коллектор (DN, материал), ' +
      'ШУ, корпус/резервуары, доп.оборудование. Перечисли состав (equipment).',
  },
  {
    key: 'pricing', label: 'Цена', kind: 'llm', file: 'шаги/шаг4-ценообразование.md', gate: true,
    directive: 'Выполни ШАГ 4 (ценообразование): собери BOM по группам, оцени цены (насос CNP — по прайсу через ' +
      'инструменты БД; прочее — оценочно, помечай «грубая оценка»), посчитай себестоимость и цену клиенту.',
  },
  {
    key: 'output', label: 'Выход', kind: 'llm', file: 'шаги/шаг5-выход.md',
    directive: 'Выполни ШАГ 5 (выход): сформируй шифр изделия по номенклатуре, выбери итоговый вариант, ' +
      'пройди чек-лист валидации. Выведи шифр и итог.',
  },
];

async function seedType(typeCode: string, steps: Step[]) {
  const has = await db.typeStep.count({ where: { typeCode } });
  if (has > 0) { console.log(`${typeCode}: уже есть шаги (${has}) — не трогаю.`); return; }
  const type = await db.systemType.findUnique({ where: { code: typeCode } });
  if (!type) { console.log(`${typeCode}: типа нет — пропуск.`); return; }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    await db.typeStep.create({ data: { typeCode, order: i, key: s.key, label: s.label, kind: s.kind, directive: s.directive ?? null, file: s.file ?? null, gate: !!s.gate } });
  }
  console.log(`${typeCode}: засеяно ${steps.length} шагов.`);
}

async function main() {
  await seedType('fire', FIRE_STEPS);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
