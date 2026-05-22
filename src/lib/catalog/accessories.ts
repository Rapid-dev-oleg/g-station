import type { AccessorySku, BlockBoxSku } from '@/lib/types';

/** Аксессуары: газоанализаторы, поплавковые выключатели, датчики, муфты, ремни. */
export const ACCESSORIES: AccessorySku[] = [
  {
    sku: 'HOBBIT-T-202-CH4-CO-H2S-NH3',
    category: 'gas_analyzer',
    name: 'Газоанализатор стационарный Хоббит-Т-202-CH4-2CO-2H2S-2NH3',
    vendor: 'Хоббит',
    unitPriceRub: 200000,
    defaultDiscountPct: 0,
    notes: 'Стационарный, многоканальный. Обязателен для хоз-быт КНС.'
  },
  {
    sku: 'OVEN-FLOAT-10M',
    category: 'level_float',
    name: 'Поплавковый выкл. Овен 10м',
    vendor: 'Овен',
    unitPriceRub: 5000,
    defaultDiscountPct: 0,
    notes: 'Кабель 10 м. На КНС нужно 4 шт (нижний / рабочий / резервный / аварийный).'
  },
  {
    sku: 'PRESSURE-SP100-10BAR',
    category: 'pressure_sensor',
    name: 'Датчик давления SP100, 0…10 Атм, двухпроводный, 4…20 мА, +24В',
    unitPriceUsd: 63,
    unitPriceRub: 5166,
    defaultDiscountPct: 45
  } as AccessorySku & { unitPriceUsd?: number },
  {
    sku: 'PRESSURE-UNIVERSAL',
    category: 'pressure_sensor',
    name: 'Датчик давления',
    unitPriceRub: 7000,
    defaultDiscountPct: 0,
    notes: 'Для каскадной работы насосов.'
  }
];

/** Блок-боксы — из выходных xlsx архива. */
export const BLOCK_BOXES: BlockBoxSku[] = [
  {
    sku: 'BB-4.3x2.3x2.7',
    model: 'Блок-бокс 4,3м × 2,3м × 2,7м',
    variant: 'sandwich',
    sizeLength: 4.3,
    sizeWidth: 2.3,
    sizeHeight: 2.7,
    unitPriceRub: 741750,
    defaultDiscountPct: 0,
    forPumpPower: { min: 0.5, max: 5 }
  },
  {
    sku: 'BB-4.8x2.7x2.7',
    model: 'Блок-бокс 4,8м × 2,7м × 2,7м',
    variant: 'sandwich',
    sizeLength: 4.8,
    sizeWidth: 2.7,
    sizeHeight: 2.7,
    unitPriceRub: 972000,
    defaultDiscountPct: 0,
    forPumpPower: { min: 10, max: 30 }
  }
];

export function pickBlockBoxForPower(power: number): BlockBoxSku | undefined {
  return BLOCK_BOXES.find(b =>
    !b.forPumpPower || (power >= b.forPumpPower.min && power <= b.forPumpPower.max)
  ) || BLOCK_BOXES[BLOCK_BOXES.length - 1];
}

export function findAccessoryBySku(sku: string) {
  return ACCESSORIES.find(a => a.sku === sku);
}
