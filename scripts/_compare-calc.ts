/**
 * Сравнение расчёта СКИЛ vs КОНСТРУКТОР на одной fire-карточке.
 * Один скил, одна карточка — разница только во вставке блока инструкций из БД
 * (это и есть весь смысл «конструктора»). БД не пишем. НЕ коммитить.
 */
import { db } from '@/server/db';
import { runKimiAgent } from '@/server/ai/kimi-agent';
import { compileInstructions } from '@/server/instructions/compile';

function buildPrompt(cardJson: string, block: string): string {
  return (
    'Выполни ШАГИ 1-3 скила pump-station-calc для этой станции: определи тип, ' +
    'посчитай рабочую точку и характеристики (шаг 2), подбери ПОЛНЫЙ СОСТАВ ' +
    'оборудования (шаг 3 — основной насос, жокей если нужен, коллектор, ШУ, ' +
    'резервуары, дренажный/вакуумный насос, реле/манометры/затворы/клапаны, ' +
    'компрессор, патрубки МПТ, опции 04/05/08 — всё, что диктует методика и ' +
    'модуль типа). НЕ ограничивайся минимальным списком — пройди скил.\n\n' +
    'НЕ ищи в интернете (точные модели/цены найдёт следующий этап). НЕ выбирай ' +
    'бренд/производителя/точную модель — это решение инженера (правило 3.11).\n\n' +
    'Верни СТРОГО JSON-блоком:\n```json\n' +
    '{\n  "items":[{"param":"<характеристика>","value":"<значение>","rationale":"<правило/норматив>","gate":false}, ...],\n' +
    '  "code":"<шифр изделия по nomenclature.md>",\n' +
    '  "equipment":[\n    {"category":"<категория>","name":"<наименование>","qty":<n>,"req":{<характеристики позиции>}},\n    ...\n  ]\n}\n```\n\n' +
    'Категории equipment: pump, jockey, collector, shu, tank, vfd, valve, check_valve, ' +
    'pressure_switch, gauge, vibro_mount, pipe_fitting, sensor, compressor, drainage_pump, ' +
    'vacuum_pump, foot_valve, suction_hose, mpt_branch, cabinet.\n\n' +
    'НЕ включай в items «Точная модель насоса», «Производитель/бренд», «Коэффициент наценки».' +
    block +
    '\n\nКарточка:\n' + cardJson
  );
}

function extractJson(out: string): { items?: any[]; code?: string; equipment?: any[] } | null {
  const fence = out.match(/```json\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : (out.match(/\{[\s\S]*\}/)?.[0] ?? '');
  try { return JSON.parse(raw); } catch { return null; }
}

async function main() {
  const sys = await db.system.findFirst({ where: { typeCode: 'fire', dossier: { not: undefined } } });
  if (!sys) { console.error('нет fire-системы'); process.exit(1); }
  const dossier = sys.dossier as any;
  const card = { object_name: dossier?.meta?.object_name, input: dossier?.stations?.[0]?.input ?? {} };
  const cardJson = JSON.stringify(card, null, 2);
  console.log(`Субъект: «${sys.name}»  (input-полей: ${Object.keys(card.input).length})`);

  const compiled = await compileInstructions('fire');
  const block = '\n\nИНСТРУКЦИИ ТИПА (обязательны к применению, приоритет над общими умолчаниями скила; ссылки на нормы уже развёрнуты):\n' + compiled + '\n';
  console.log(`Блок конструктора: ${compiled.length} символов (${(compiled.match(/###/g) || []).length} пунктов)\n`);

  console.log('Запускаю ДВА прогона агента (skill / constructor) параллельно…');
  const t0 = Date.now();
  const [skillOut, ctorOut] = await Promise.all([
    runKimiAgent({ skill: 'pump-station-calc', prompt: buildPrompt(cardJson, ''), timeoutMs: 8 * 60 * 1000 }),
    runKimiAgent({ skill: 'pump-station-calc', prompt: buildPrompt(cardJson, block), timeoutMs: 8 * 60 * 1000 }),
  ]);
  console.log(`Готово за ${Math.round((Date.now() - t0) / 1000)}с\n`);

  for (const [label, res] of [['СКИЛ', skillOut], ['КОНСТРУКТОР', ctorOut]] as const) {
    const p = extractJson(res.output);
    console.log(`\n══════════ ${label} ══════════`);
    console.log('шифр:', p?.code ?? '(не распознан)');
    console.log('items:', (p?.items ?? []).length, '— ', (p?.items ?? []).map((i: any) => `${i.param}=${i.value}`).slice(0, 8).join(' | '));
    console.log('equipment:', (p?.equipment ?? []).length, 'позиций — ', (p?.equipment ?? []).map((e: any) => `${e.category}×${e.qty ?? 1}`).join(', '));
  }
  await db.$disconnect();
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
