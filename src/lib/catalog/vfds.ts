import type { VfdSku } from '@/lib/types';

/** Частотные преобразователи — из выходных файлов архива. */
export const VFDS: VfdSku[] = [
  {
    sku: 'CNP-PDES0011D-4T-IP65',
    brand: 'CNP',
    model: 'PDES0011D-4T-IP65',
    power: 11,
    ipRating: 'IP65',
    unitPriceUsd: 1209,
    unitPriceRub: 97929,
    defaultDiscountPct: 50
  },
  {
    sku: 'CNP-PDES04D0K-4T-IP65',
    brand: 'CNP',
    model: 'PDES04D0K-4T-IP65',
    power: 4,
    ipRating: 'IP65',
    unitPriceUsd: 798,
    unitPriceRub: 65436,
    defaultDiscountPct: 45
  }
];

export function findVfdBySku(sku: string): VfdSku | undefined {
  return VFDS.find(v => v.sku === sku);
}

export function pickVfdForPower(power: number): VfdSku | undefined {
  // Берём ближайший с запасом
  return VFDS.filter(v => v.power >= power * 0.9).sort((a, b) => a.power - b.power)[0];
}
