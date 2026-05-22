// Скрипт проверки: подбор оборудования и итог закупки по каждой моковой системе
// должны совпадать с эталонными значениями из архива (папки AI/Выход*).
// Запуск: npx tsx scripts/verify-archive.ts

import { compute } from '../src/lib/calc';
import { MOCK_PROJECTS } from '../src/lib/mock/projects';

type Expected = {
  systemId: string;
  pumpSku: string;
  panelSku?: string;
  totalCost: number;        // ₽ закупки
  tolerance?: number;        // допуск ₽ (по умолчанию 1)
};

const EXPECTED: Expected[] = [
  // П-1
  { systemId: 'sys-fire-552', pumpSku: 'WELLMIX-NBW-65-40-250-11', panelSku: 'SHUF-223-11K', totalCost: 482227 },
  { systemId: 'sys-fire-552a', pumpSku: 'WELLMIX-NBW-200-150-400-75', panelSku: 'SHUFS-223-75K', totalCost: 1704476 },
  // П-2
  { systemId: 'sys-kns-hozbyt', pumpSku: 'WILO-NSPG-CF50-400-1.1', panelSku: 'SCHUN-KNS-MAKS-2x1.5', totalCost: 1266396.5 },
  { systemId: 'sys-kns-livnevka', pumpSku: 'CNP-150WQ180-20-18.5', panelSku: 'SCHUN-KNS-MAKS-2x18.5', totalCost: 2203728.3 },
  // П-3
  { systemId: 'sys-osadok', pumpSku: 'AREOPAG-NP25', panelSku: 'SHUCH-111-1.1K-2D', totalCost: 507267.7 },
  { systemId: 'sys-promyvka', pumpSku: 'WELLMIX-CV-90-2', panelSku: 'SHUCH-213-15K-4D', totalCost: 684818.4 },
  { systemId: 'sys-podacha', pumpSku: 'CNP-SP-2MQHRC-2900', panelSku: 'SHUCH-213-11K-4D', totalCost: 678960.6 },
  // Для ОНВ-50/24 (СЕТУНЬ ИНЖИНИРИНГ): шкаф управления укомплектован заводом-производителем,
  // в спецификацию идёт только насос + ЧРП (так оформлено в архивном ТКП).
  { systemId: 'sys-flotoshlam', pumpSku: 'SETUN-ONV-50-24', totalCost: 912384.5 },
  { systemId: 'sys-drenazh', pumpSku: 'CNP-SP-2MQHRC-2900', panelSku: 'SHUCH-213-11K-4D', totalCost: 678960.6 },
  // П-4
  { systemId: 'sys-gidro', pumpSku: 'CNP-TD65-20G12SWHCJ', totalCost: 88441.1, tolerance: 2 }
];

let failed = 0;
console.log('Проверка моков против эталонов из архива:\n');

for (const exp of EXPECTED) {
  const sys = MOCK_PROJECTS.flatMap(p => p.systems).find(s => s.id === exp.systemId);
  if (!sys) { console.log(`❌ ${exp.systemId}: не найден в моках`); failed++; continue; }

  const r = compute(sys);
  const okPump = r.computed.selectedPumpSku === exp.pumpSku;
  const okPanel = !exp.panelSku || r.computed.selectedPanelSku === exp.panelSku;
  const okCost = Math.abs(r.totalCost - exp.totalCost) <= (exp.tolerance ?? 1);

  const ok = okPump && okPanel && okCost;
  if (ok) {
    console.log(`✅ ${exp.systemId}: ${r.computed.selectedPumpSku} | ${r.computed.selectedPanelSku ?? '—'} | ${r.totalCost.toFixed(2)} ₽`);
  } else {
    failed++;
    console.log(`❌ ${exp.systemId}:`);
    if (!okPump) console.log(`   насос: ожидали ${exp.pumpSku}, получили ${r.computed.selectedPumpSku}`);
    if (!okPanel) console.log(`   ШУ: ожидали ${exp.panelSku}, получили ${r.computed.selectedPanelSku}`);
    if (!okCost) console.log(`   итог: ожидали ${exp.totalCost}, получили ${r.totalCost.toFixed(2)} (Δ=${(r.totalCost - exp.totalCost).toFixed(2)})`);
    console.log(`   BOM:`); r.bom.forEach(b => console.log(`     ${b.position}. ${b.name} | ${b.unitPrice} ×${b.quantity} | -${b.discountPct}% = ${b.purchaseCost.toFixed(2)}`));
  }
}

console.log(`\nИтого: ${EXPECTED.length - failed}/${EXPECTED.length} прошли`);
process.exit(failed > 0 ? 1 : 0);
