/**
 * Сквозная проверка: ТЗ-файл → Kimi читает → Kimi считает по скилу.
 * Печатает в консоль ОБА этапа, чтобы видеть и вход, и выход.
 *
 * Запуск:  npm run kimi:calc -- "<путь к файлу ТЗ>"
 * Без аргумента берёт тестовое ТЗ Арзамас.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { extractText } from '../src/server/ai/extract-text';
import { documentToImages } from '../src/server/ai/document-images';
import { parseDocument } from '../src/server/ai/parse-document';
import { runKimiAgent } from '../src/server/ai/kimi-agent';

const DEFAULT_FILE =
  '/home/oblacko/Projects/gidrostroy/Данные/Даша G-FIRE/Вход 3 Даша/G-Fire  Арзамас, ул. Кирова..docx';

function line(s = '') {
  console.log(s);
}
function hr(title: string) {
  line('\n' + '━'.repeat(70));
  line('  ' + title);
  line('━'.repeat(70));
}

async function main() {
  const file = process.argv[2] || DEFAULT_FILE;
  process.env.KIMI_AGENT_WORKSPACE =
    process.env.KIMI_AGENT_WORKSPACE || '/home/oblacko/Projects/gidrostroy';

  hr(`ФАЙЛ ТЗ: ${basename(file)}`);
  const buffer = await readFile(file);
  line(`размер: ${(buffer.length / 1024).toFixed(0)} КБ`);

  // ── 1. Что Kimi ПРОЧИТАЛ из ТЗ ──────────────────────────────────────
  hr('ШАГ 1 — Kimi ЧИТАЕТ ТЗ (распознанная карточка)');
  let text = '';
  try {
    text = (await extractText(basename(file), buffer)).text;
  } catch {
    /* скан без текста — пойдём в vision */
  }
  const images = text.trim().length >= 40 ? [] : await documentToImages(basename(file), buffer);
  line(text.trim().length >= 40 ? 'тип: текстовый документ' : `тип: скан → ${images.length} картинок в Kimi vision`);
  line('…читаю через Kimi…\n');

  const parsed = await parseDocument({ text: text.trim().length >= 40 ? text : '', images });
  const i = parsed.input;
  line('РАСПОЗНАНО:');
  line(`  Объект:      ${parsed.meta.object_name ?? '—'}`);
  line(`  Заказчик:    ${parsed.client?.shortName ?? '—'}${parsed.client?.email ? ' / ' + parsed.client.email : ''}`);
  line(`  Назначение:  ${i.purpose ?? '—'}`);
  line(`  Расход Q:    ${i.Q?.value ?? '—'} ${i.Q?.unit ?? ''}  (${i.Q?.note ?? ''})`);
  line(`  Напор H:     ${i.H?.value ?? '—'} ${i.H?.unit ?? ''}  (${i.H?.note ?? ''})`);
  line(`  Схема:       ${i.reservation_scheme ?? '—'}`);
  line(`  Насосы:      ${(i.pump_type_required ?? []).join(', ') || '—'}`);
  line(`  Жокей:       ${i.jockey_required ? 'да' : 'нет'}`);
  line(`  Не хватает:  ${parsed.missing.join(', ') || '—'}`);

  // ── 2. Что Kimi ПОСЧИТАЛ по скилу ───────────────────────────────────
  hr('ШАГ 2 — Kimi СЧИТАЕТ станцию по скилу pump-station-calc');
  line('…агент читает методику и считает (это 2–4 минуты)…\n');
  const card = {
    object_name: parsed.meta.object_name,
    purpose: i.purpose,
    Q: i.Q,
    H: i.H,
    reservation_scheme: i.reservation_scheme,
    pump_type_required: i.pump_type_required,
    jockey_required: i.jockey_required,
  };
  const { output } = await runKimiAgent({
    skill: 'pump-station-calc',
    prompt:
      'Посчитай станцию по карточке и верни понятный итог: схема, насос (класс), мотор кВт, ' +
      'коллектор DN, жокей, шкаф, шифр — и КОРОТКО обоснуй каждое решение (1 строка). ' +
      'В конце — что вынести на проверку инженеру. Карточка:\n' +
      JSON.stringify(card, null, 2),
    timeoutMs: 8 * 60 * 1000,
  });
  line(output);
  hr('ГОТОВО');
}

main().catch((e) => {
  console.error('ОШИБКА:', e?.message || e);
  process.exit(1);
});
