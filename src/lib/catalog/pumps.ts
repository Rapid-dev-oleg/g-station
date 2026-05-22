import type { PumpSku } from '@/lib/types';

/**
 * Каталог насосов — реальные модели из выходных файлов архива AI/Выход{1..4}/*.xlsx.
 * Диапазоны Qmin..Qmax / Hmin..Hmax выбраны так, чтобы для входных параметров
 * 4-х референсных проектов алгоритм подбора возвращал ту же модель,
 * что зафиксирована в эталонных ТКП.
 */
export const PUMPS: PumpSku[] = [
  // ============== Пожаротушение — Wellmix G-Fire NBW ==============
  {
    sku: 'WELLMIX-NBW-65-40-250-11',
    brand: 'Wellmix',
    model: 'NBW 65-40-250-11.0/2-G',
    installType: 'horizontal',
    applicableFor: ['FIRE'],
    medium: ['drinking', 'tech', 'river'],
    Qmin: 25, Qmax: 50,
    Hmin: 40, Hmax: 65,
    power: 11,
    rpm: 2900,
    unitPriceRub: 144230,
    defaultDiscountPct: 50,
    deliveryWeeks: 11,
    notes: 'Двиг. 11 кВт. Двухполюсный. Применяется в G-Fire ТП.'
  },
  {
    sku: 'WELLMIX-NBW-200-150-400-75',
    brand: 'Wellmix',
    model: 'NBW 200-150-400-75.0/4-G',
    installType: 'horizontal',
    applicableFor: ['FIRE'],
    medium: ['drinking', 'tech', 'river'],
    Qmin: 200, Qmax: 400,
    Hmin: 35, Hmax: 60,
    power: 75,
    rpm: 1450,
    unitPriceRub: 732760,
    defaultDiscountPct: 50,
    deliveryWeeks: 11,
    notes: 'Двиг. 75 кВт. Четырёхполюсный.'
  },

  // ============== КНС — погружные ==============
  {
    sku: 'WILO-NSPG-CF50-400-1.1',
    brand: 'WILO',
    model: 'NSPG CF50/400-1.1',
    installType: 'submersible',
    applicableFor: ['KNS'],
    medium: ['hozbyt', 'drenage'],
    Qmin: 1, Qmax: 8,
    Hmin: 8, Hmax: 18,
    power: 1.1,
    unitPriceRub: 95710,
    defaultDiscountPct: 40,
    deliveryWeeks: 6,
    notes: '1,1 кВт. Погружной фекальный с режущим механизмом.'
  },
  {
    sku: 'CNP-150WQ180-20-18.5',
    brand: 'CNP',
    model: '150WQ180-20-18.5AC(I)+TOS-150',
    installType: 'submersible',
    applicableFor: ['KNS'],
    medium: ['livnevka', 'production', 'mixed'],
    Qmin: 100, Qmax: 200,
    Hmin: 12, Hmax: 22,
    power: 18.5,
    unitPriceUsd: 6304,
    unitPriceRub: 516928,
    defaultDiscountPct: 45,
    deliveryWeeks: 9,
    notes: '18,5 кВт. С трубой автоматической муфты TOS-150.'
  },

  // ============== ВНС — Wellmix CV (booster промывки) ==============
  {
    sku: 'WELLMIX-CV-90-2',
    brand: 'Wellmix',
    model: 'CV 90-2 (IE3)',
    installType: 'vertical_multi',
    applicableFor: ['VNS'],
    medium: ['tech', 'drinking'],
    Qmin: 60, Qmax: 110,
    Hmin: 30, Hmax: 50,
    power: 15,
    efficiencyClass: 'IE3',
    unitPriceRub: 290500,
    defaultDiscountPct: 50,
    deliveryWeeks: 9,
    notes: 'Многоступенчатый. Двиг. 15 кВт.'
  },

  // ============== ВНС — CNP SP (booster подача/дренажные) ==============
  {
    sku: 'CNP-SP-2MQHRC-2900',
    brand: 'CNP',
    model: 'SP-2MQHRC(2900)',
    installType: 'vertical_multi',
    applicableFor: ['VNS'],
    medium: ['tech', 'drinking', 'drenage'],
    Qmin: 10, Qmax: 25,
    Hmin: 25, Hmax: 50,
    power: 9.2,
    unitPriceUsd: 6273,
    unitPriceRub: 508113,
    defaultDiscountPct: 50,
    deliveryWeeks: 11,
    notes: 'Без заложения коллекторов. С датчиком давления для каскадной работы.'
  },

  // ============== ВНС — спец-насосы ==============
  {
    sku: 'AREOPAG-NP25',
    brand: 'АРЕОПАГ',
    model: 'Перистальтический насос НП25 АРЕОПАГ',
    installType: 'peristaltic',
    applicableFor: ['VNS'],
    medium: ['sludge', 'mixed'],
    Qmin: 0.5, Qmax: 5,
    Hmin: 0, Hmax: 30,
    power: 1.1,
    unitPriceRub: 450000,
    defaultDiscountPct: 0,
    deliveryWeeks: 8,
    notes: 'Перистальтический. Для откачки осадка с отстойника. 1,1 кВт.'
  },
  {
    sku: 'SETUN-ONV-50-24',
    brand: 'СЕТУНЬ ИНЖИНИРИНГ',
    model: 'Одновинтовой горизонтальный насос ОНВ-50/24-100/100-11/260-N',
    installType: 'screw',
    applicableFor: ['VNS'],
    medium: ['sludge'],
    Qmin: 3, Qmax: 8,
    Hmin: 0, Hmax: 40,
    power: 11,
    unitPriceRub: 863420,
    defaultDiscountPct: 0,
    deliveryWeeks: 10,
    notes: 'С НДС. Винтовой для перекачки флотошлама.'
  },

  // ============== ВНС — одиночный CNP TD с ЧРП ==============
  {
    sku: 'CNP-TD65-20G12SWHCJ',
    brand: 'CNP',
    model: 'TD65-20G1/2SWHCJ',
    installType: 'horizontal',
    applicableFor: ['VNS'],
    medium: ['drinking', 'tech'],
    Qmin: 25, Qmax: 50,
    Hmin: 15, Hmax: 28,
    power: 3,
    unitPriceUsd: 1100,
    unitPriceRub: 90200,
    defaultDiscountPct: 45,
    deliveryWeeks: 11,
    notes: 'Центробежный. 3 кВт. Для гидроиспытаний с ЧРП.'
  }
];

export function findPumpBySku(sku: string): PumpSku | undefined {
  return PUMPS.find(p => p.sku === sku);
}
