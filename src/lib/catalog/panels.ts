import type { PanelSku } from '@/lib/types';

/**
 * Шкафы управления — точные модели из выходных xlsx архива.
 * Цены, скидки и применимость — 1:1 с архивом.
 */
export const PANELS: PanelSku[] = [
  // ========= Пожаротушение (ШУФ / ШУФС) =========
  {
    sku: 'SHUF-223-11K',
    model: 'ШУФ-223-11к + АВР + 3Пз + RS-485',
    applicableFor: ['FIRE'],
    pumpsCount: 2,
    totalPower: 22,
    startType: 'direct',
    avr: true,
    outdoor: false,
    unitPriceRub: 151637,
    defaultDiscountPct: 0,
    notes: 'Для пожарной НС 1+1 на 11 кВт. С АВР, 3-фазной защитой, RS-485.'
  },
  {
    sku: 'SHUFS-223-75K',
    model: 'ШУФС-223-75к + АВР + 3Пз + RS-485',
    applicableFor: ['FIRE'],
    pumpsCount: 2,
    totalPower: 150,
    startType: 'soft',
    avr: true,
    outdoor: false,
    unitPriceRub: 501816,
    defaultDiscountPct: 0,
    notes: 'Для пожарной НС 1+1 на 75 кВт. Плавный пуск, АВР, RS-485.'
  },

  // ========= КНС (ЩУН-КНС-МАКС, уличное) =========
  {
    sku: 'SCHUN-KNS-MAKS-2x1.5',
    model: 'ЩУН-КНС-МАКС-2x1.5кВт-УХЛ1(О)',
    applicableFor: ['KNS'],
    pumpsCount: 2,
    totalPower: 3,
    startType: 'direct',
    avr: false,
    outdoor: true,
    unitPriceRub: 240670,
    defaultDiscountPct: 45,
    notes: 'Уличное исполнение. Для КНС с 2 насосами по 1,5 кВт.'
  },
  {
    sku: 'SCHUN-KNS-MAKS-2x18.5',
    model: 'ЩУН-КНС-МАКС-2x18.5кВт-УХЛ1(О)',
    applicableFor: ['KNS'],
    pumpsCount: 2,
    totalPower: 37,
    startType: 'soft',
    avr: false,
    outdoor: true,
    unitPriceRub: 288722,
    defaultDiscountPct: 45,
    notes: 'Уличное исполнение. Для ливневой КНС с насосами 18,5 кВт.'
  },

  // ========= ВНС / спец-насосы (ШУЧ) =========
  {
    sku: 'SHUCH-111-1.1K-2D',
    model: 'ШУЧ-111-1,1к-2Д',
    applicableFor: ['VNS'],
    pumpsCount: 1,
    totalPower: 1.1,
    startType: 'direct',
    avr: false,
    outdoor: false,
    unitPriceRub: 81811,
    defaultDiscountPct: 30,
    notes: 'Шкаф для одиночного перистальтического/мембранного насоса 1,1 кВт.'
  },
  {
    sku: 'SHUCH-213-15K-4D',
    model: 'ШУЧ-213-15к-4Д',
    applicableFor: ['VNS'],
    pumpsCount: 2,
    totalPower: 30,
    startType: 'direct',
    avr: true,
    outdoor: false,
    unitPriceRub: 288312,
    defaultDiscountPct: 30,
    notes: 'Для бустерной 1+1 на 15 кВт. С контролем давления.'
  },
  {
    sku: 'SHUCH-213-11K-4D',
    model: 'ШУЧ-213-11к-4Д',
    applicableFor: ['VNS'],
    pumpsCount: 2,
    totalPower: 22,
    startType: 'direct',
    avr: true,
    outdoor: false,
    unitPriceRub: 234068,
    defaultDiscountPct: 30,
    notes: 'Для бустерной 1+1 на ~11 кВт. С датчиком давления / уровнемером.'
  },
  {
    sku: 'SHUCH-113-11K-2D',
    model: 'ШУЧ-113-11к-2Д',
    applicableFor: ['VNS'],
    pumpsCount: 1,
    totalPower: 11,
    startType: 'vfd',
    avr: false,
    outdoor: false,
    unitPriceRub: 151551,
    defaultDiscountPct: 30,
    notes: 'Для одиночного винтового насоса 11 кВт с ЧРП.'
  }
];

export function findPanelBySku(sku: string): PanelSku | undefined {
  return PANELS.find(p => p.sku === sku);
}
