import { ACCESSORIES, BLOCK_BOXES, pickBlockBoxForPower } from '@/lib/catalog/accessories';
import { COLLECTORS, pickCollector } from '@/lib/catalog/collectors';
import { findPanelBySku } from '@/lib/catalog/panels';
import { findVfdBySku } from '@/lib/catalog/vfds';
import type {
  AccessorySku, BomItem, FireSystem, KnsSystem, PanelSku, PumpSku, VfdSku, VnsSystem
} from '@/lib/types';

let _counter = 0;
const uid = () => `bom-${Date.now()}-${++_counter}`;

const toBom = (
  pos: number,
  group: BomItem['group'],
  sku: { sku?: string; brand?: string; model?: string; name?: string },
  unitPriceRub: number,
  qty: number,
  discount: number,
  comment?: string
): BomItem => {
  const amount = unitPriceRub * qty;
  const purchase = amount * (1 - discount / 100);
  return {
    id: uid(),
    position: pos,
    article: sku.sku,
    vendor: sku.brand,
    name: sku.model || sku.name || sku.sku || '',
    comment,
    unitPrice: unitPriceRub,
    quantity: qty,
    amount,
    discountPct: discount,
    purchaseCost: purchase,
    group
  };
};

// ============================ FIRE ============================
export function buildFireBom(system: FireSystem, pump: PumpSku, panel?: PanelSku): { bom: BomItem[]; totalCost: number } {
  const totalPumps = system.data.workingPumps + system.data.reservePumps;
  const collector = pickCollector({ systemType: 'FIRE', pumpPower: pump.power });
  const bom: BomItem[] = [];
  let pos = 1;

  // 1. Насосы
  bom.push(toBom(pos++, 'pump', pump, pump.unitPriceRub, totalPumps, pump.defaultDiscountPct,
    `Двиг. ${pump.power} кВт. ${pump.deliveryWeeks ?? '—'} недель`));

  // 2. Коллектор + работы
  if (collector) {
    bom.push(toBom(pos++, 'collector',
      { sku: collector.sku, model: `Коллектор ${collector.model}` },
      collector.unitPriceRub, 1, 0, 'Материалы для коллектора'));
    bom.push(toBom(pos++, 'work', { model: 'Работы по сварке коллектора' },
      collector.weldingPriceRub, 1, 0));
    bom.push(toBom(pos++, 'work', { model: 'Работы по сварке рамы' },
      collector.frameWeldingPriceRub, 1, 0));
    bom.push(toBom(pos++, 'work', { model: 'Расключение' },
      collector.wiringPriceRub, 1, 0));
  }

  // 3. Шкаф управления
  if (panel) {
    bom.push(toBom(pos++, 'panel', panel, panel.unitPriceRub, 1, panel.defaultDiscountPct));
  }

  const totalCost = bom.reduce((s, b) => s + b.purchaseCost, 0);
  return { bom, totalCost };
}

// ============================ KNS ============================
export function buildKnsBom(system: KnsSystem, pump: PumpSku, panel?: PanelSku): { bom: BomItem[]; totalCost: number } {
  const totalPumps = system.data.workingPumps + system.data.reservePumps + system.data.warehousePumps;
  const bom: BomItem[] = [];
  let pos = 1;

  // 1. Насосы
  bom.push(toBom(pos++, 'pump', pump, pump.unitPriceRub, totalPumps, pump.defaultDiscountPct,
    `${pump.power} кВт`));

  // 2. Шкаф управления
  if (panel) {
    bom.push(toBom(pos++, 'panel', panel, panel.unitPriceRub, 1, panel.defaultDiscountPct));
  }

  // 3. Поплавковые выключатели (4 шт — стандарт для КНС)
  const float = ACCESSORIES.find(a => a.sku === 'OVEN-FLOAT-10M');
  if (float) {
    bom.push(toBom(pos++, 'sensor', { sku: float.sku, brand: float.vendor, model: float.name },
      float.unitPriceRub, 4, float.defaultDiscountPct));
  }

  // 4. Блок-бокс (для наземных)
  if (system.data.installation === 'aboveground_blockbox' || system.data.blockBox) {
    const box = pickBlockBoxForPower(pump.power);
    if (box) {
      bom.push(toBom(pos++, 'blockbox', { sku: box.sku, model: box.model },
        box.unitPriceRub, 1, box.defaultDiscountPct));
    }
  }

  // 5. Газоанализатор (для хоз-быт обязателен)
  if (system.data.gasAnalyzer) {
    const gas = ACCESSORIES.find(a => a.sku === 'HOBBIT-T-202-CH4-CO-H2S-NH3');
    if (gas) {
      bom.push(toBom(pos++, 'sensor', { sku: gas.sku, brand: gas.vendor, model: gas.name },
        gas.unitPriceRub, 1, gas.defaultDiscountPct));
    }
  }

  const totalCost = bom.reduce((s, b) => s + b.purchaseCost, 0);
  return { bom, totalCost };
}

// ============================ VNS ============================
export function buildVnsBom(
  system: VnsSystem, pump: PumpSku, panel?: PanelSku, vfd?: VfdSku, pressureSensor?: boolean
): { bom: BomItem[]; totalCost: number } {
  const totalPumps = system.data.workingPumps + system.data.reservePumps;
  const subtype = system.data.subtype;
  const bom: BomItem[] = [];
  let pos = 1;

  // 1. Насос(ы)
  bom.push(toBom(pos++, 'pump', pump, pump.unitPriceRub, totalPumps, pump.defaultDiscountPct,
    `Двиг. ${pump.power} кВт. ${pump.deliveryWeeks ?? '—'} недель`));

  // 2. Коллектор + работы (только для бустерной с 2+ насосами на раме)
  const needsCollector = totalPumps >= 2 &&
    !system.data.withoutCollector &&
    (subtype === 'booster_filter_backwash' || subtype === 'booster_drinking' || subtype === 'booster_production');
  if (needsCollector) {
    const collector = pickCollector({ systemType: 'VNS', pumpPower: pump.power });
    if (collector) {
      bom.push(toBom(pos++, 'collector',
        { sku: collector.sku, model: `Коллектор ${collector.model}` },
        collector.unitPriceRub, 1, 0, 'Материалы для коллектора'));
      bom.push(toBom(pos++, 'work', { model: 'Работы по сварке коллектора' },
        collector.weldingPriceRub, 1, 0));
      bom.push(toBom(pos++, 'work', { model: 'Работы по сварке рамы' },
        collector.frameWeldingPriceRub, 1, 0));
      bom.push(toBom(pos++, 'work', { model: 'Расключение' },
        collector.wiringPriceRub, 1, 0));
    }
  }

  // 3. Шкаф управления
  if (panel) {
    bom.push(toBom(pos++, 'panel', panel, panel.unitPriceRub, 1, panel.defaultDiscountPct));
  }

  // 4. Датчик давления (для каскадных и одиночного с ЧРП)
  if (pressureSensor) {
    // Для TD65 (одиночный ЧРП) — SP100; для каскадных — универсальный
    const sensorSku = subtype === 'spec_vfd_single' ? 'PRESSURE-SP100-10BAR' : 'PRESSURE-UNIVERSAL';
    const sensor = ACCESSORIES.find(a => a.sku === sensorSku);
    if (sensor) {
      bom.push(toBom(pos++, 'sensor', { sku: sensor.sku, brand: sensor.vendor, model: sensor.name },
        sensor.unitPriceRub, 1, sensor.defaultDiscountPct,
        sensor.notes));
    }
  }

  // 5. ЧРП (для одиночного с ЧРП и винтового с ЧРП)
  if (vfd) {
    bom.push(toBom(pos++, 'vfd', vfd, vfd.unitPriceRub, 1, vfd.defaultDiscountPct, 'частотн.преобр.'));
  }

  const totalCost = bom.reduce((s, b) => s + b.purchaseCost, 0);
  return { bom, totalCost };
}
