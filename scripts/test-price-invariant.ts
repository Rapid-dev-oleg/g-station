/**
 * Проверка инварианта этапа C: каждая позиция equipment[] → строка BOM,
 * ВКЛЮЧАЯ насос, даже если агент-подборщик недоступен (403/таймаут).
 * Запуск: npx tsx scripts/test-price-invariant.ts
 */
import { priceEquipment } from '../src/server/pricing/processor';

(async () => {
  const equipment = [
    { category: 'pump', name: 'Основной насос (ин-лайн одноступенчатый)', qty: 2, req: { class: 'IN_LINE', Q_m3h: 40, H_m: 20, motor_kW: 4, analog: 'IPN 65/140-4,0/2' } },
    { category: 'collector', name: 'Коллектор всасывающий/напорный', qty: 1, req: { dn_suction: 100, dn_discharge: 80, n_pumps: 2 } },
    { category: 'shu', name: 'Шкаф управления пожарный', qty: 1, req: { series: 'ШУФ', motor_kW: 5.5 } },
    { category: 'check_valve', name: 'Обратный клапан', qty: 2, req: { dn: 65 } },
  ];

  const bom = await priceEquipment(equipment);

  console.log(`\nвход: ${equipment.length} позиций → BOM: ${bom.length} строк`);
  for (const b of bom) console.log(`  [${b.source ?? '?'}] ${b.name}`);

  const pump = bom.find((b) => /насос/i.test(b.name));
  const ok = bom.length === equipment.length && !!pump;
  console.log(`\nИНВАРИАНТ (строк = позиций): ${bom.length === equipment.length ? 'OK' : 'FAIL'}`);
  console.log(`НАСОС В СМЕТЕ: ${pump ? 'ДА → ' + pump.name : 'НЕТ'}`);
  process.exit(ok ? 0 : 1);
})();
