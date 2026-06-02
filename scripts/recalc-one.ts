/**
 * Перерасчёт одной системы и проверка, что насос попал в смету.
 * Запуск: npx tsx scripts/recalc-one.ts <systemId>
 */
import { calcSystemViaKimi } from '../src/server/actions/kimi-calc';

const id = process.argv[2];
if (!id) {
  console.error('usage: tsx scripts/recalc-one.ts <systemId>');
  process.exit(1);
}

(async () => {
  const res = await calcSystemViaKimi(id, true);
  if (!res.ok) {
    console.error('FAIL:', res.error);
    process.exit(1);
  }
  const bom = res.data?.bom ?? [];
  console.log(`\nстрок BOM: ${bom.length}, cached=${res.cached}`);
  for (const b of bom) {
    console.log(`  [${b.source ?? '?'}] ${b.name}${b.priceRub != null ? ` — ${b.priceRub} ₽×${b.qty ?? 1}` : ' — (цена не определена)'}`);
  }
  const pump = bom.find((b) => /насос/i.test(b.name));
  console.log(`\nНАСОС В СМЕТЕ: ${pump ? 'ДА → ' + pump.name : 'НЕТ'}`);
  process.exit(0);
})();
