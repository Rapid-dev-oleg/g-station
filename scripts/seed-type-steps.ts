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
    directive: 'Выполни ШАГ 3 (подбор оборудования) по рассчитанным характеристикам. ИСТОЧНИКИ строго ' +
      'по приоритету (реестр «Источники»): (1) наш каталог БД — MCP search_catalog / find_pump_by_sku / ' +
      'find_collector / find_jockey_piping; (2) API-источник — MCP select_pump (Q/H рабочей точки → конкретные ' +
      'насосы с ценой и наличием по складам; серии — list_pump_params); (3) доверенные сайты — MCP ' +
      'list_trusted_catalogs, читай их через WebFetch; (4) свободный веб (WebSearch) — ТОЛЬКО если выше не ' +
      'нашлось, помечай оценочным. Подбери: основной насос (класс/типоразмер/мощность; если каталог/API дал ' +
      'конкретную модель с наличием — предложи её как рекомендуемую, финальное подтверждение за инженером), ' +
      'жокей, коллектор (DN, материал), ШУ, корпус/резервуары, доп. Заполняй по схеме спецификации типа. ' +
      'Перечисли состав (equipment) с источником каждой позиции.',
  },
  {
    key: 'pricing', label: 'Цена', kind: 'llm', file: 'шаги/шаг4-ценообразование.md', gate: true,
    directive: 'Выполни ШАГ 4 (ценообразование): собери BOM по группам. Цены — по приоритету источников: ' +
      'сперва РЕАЛЬНЫЕ из каталога БД / API (select_pump и find_pump_by_sku дают price), затем оценочно ' +
      '(помечай «грубая оценка»). Курсы валют — из Настроек. Посчитай себестоимость и цену клиенту.',
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

/**
 * Обновляет директивы уже засеянных шагов до актуальных (реестр источников).
 * Идемпотентно и БЕЗОПАСНО: обновляем директиву шага ТОЛЬКО если она отличается
 * от новой И ещё не содержит новых MCP-инструментов (не затираем ручные правки,
 * не трогаем уже обновлённые).
 */
async function refreshDirectives(typeCode: string, steps: Step[]) {
  for (const s of steps) {
    if (!s.directive) continue;
    const existing = await db.typeStep.findUnique({ where: { typeCode_key: { typeCode, key: s.key } } });
    if (!existing?.directive || existing.directive === s.directive) continue;
    if (/select_pump|list_trusted_catalogs/.test(existing.directive)) continue; // уже обновлена
    await db.typeStep.update({ where: { id: existing.id }, data: { directive: s.directive } });
    console.log(`${typeCode}.${s.key}: директива обновлена под реестр источников.`);
  }
}

async function main() {
  await seedType('fire', FIRE_STEPS);
  await refreshDirectives('fire', FIRE_STEPS);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
