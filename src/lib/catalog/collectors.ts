import type { CollectorSku, SystemType } from '@/lib/types';

/** Коллекторы и работы по их сварке/расключению — из xlsx архива. */
export const COLLECTORS: CollectorSku[] = [
  {
    sku: 'COLL-100-80-2-65-40',
    model: '100/80-2-65/40',
    description: 'Коллектор для НС 1+1 с насосами на DN65/40',
    diameter: 100,
    branches: 2,
    unitPriceRub: 108560,
    weldingPriceRub: 32200,
    frameWeldingPriceRub: 28800,
    wiringPriceRub: 16800
  },
  {
    sku: 'COLL-300-250-2-200-150',
    model: '300/250-2-200/150',
    description: 'Коллектор для НС 1+1 с насосами на DN200/150',
    diameter: 300,
    branches: 2,
    unitPriceRub: 334650,
    weldingPriceRub: 75900,
    frameWeldingPriceRub: 40250,
    wiringPriceRub: 19100
  },
  {
    sku: 'COLL-150-2-100',
    model: '150-2-100',
    description: 'Коллектор для НС 1+1 с насосами CV (DN100)',
    diameter: 150,
    branches: 2,
    unitPriceRub: 125350,
    weldingPriceRub: 34500,
    frameWeldingPriceRub: 28750,
    wiringPriceRub: 3900
  }
];

/** Подбор коллектора зависит от типа системы и мощности насоса. */
export function pickCollector(opts: {
  systemType: SystemType;
  pumpPower: number;
}): CollectorSku | undefined {
  const { systemType, pumpPower } = opts;

  if (systemType === 'FIRE') {
    if (pumpPower <= 30) return COLLECTORS[0];   // 100/80-2-65/40
    return COLLECTORS[1];                          // 300/250-2-200/150
  }
  // VNS: бустерные с CV → 150-2-100; крупные → 300/250
  if (systemType === 'VNS') {
    if (pumpPower <= 20) return COLLECTORS[2];   // 150-2-100
    if (pumpPower <= 30) return COLLECTORS[0];
    return COLLECTORS[1];
  }
  // KNS: коллектор обычно интегрирован в корпус — здесь не используется.
  return undefined;
}
