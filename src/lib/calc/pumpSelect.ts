import { PUMPS } from '@/lib/catalog/pumps';
import type { Medium, PumpInstallType, PumpSku, SystemType } from '@/lib/types';

export type PumpSelectionFilter = {
  systemType: SystemType;
  Q: number;
  H: number;
  medium?: Medium;
  installType?: PumpInstallType;
  preferredBrand?: string;
  minPower?: number;
};

/**
 * Подбор насоса по рабочей точке (Q, H).
 * Возвращает массив подходящих кандидатов, отсортированных по релевантности.
 * Первый элемент = лучший подбор.
 */
export function selectPumps(filter: PumpSelectionFilter): PumpSku[] {
  const { systemType, Q, H, medium, installType, preferredBrand } = filter;

  const candidates = PUMPS.filter(p => {
    if (!p.applicableFor.includes(systemType)) return false;
    if (medium && !p.medium.includes(medium)) return false;
    if (installType && p.installType !== installType) return false;
    if (Q < p.Qmin || Q > p.Qmax) return false;
    if (H > 0 && (H < p.Hmin || H > p.Hmax)) return false;
    return true;
  });

  return candidates.sort((a, b) => {
    // Предпочтение бренда (если задано)
    if (preferredBrand && preferredBrand !== 'any') {
      if (a.brand === preferredBrand && b.brand !== preferredBrand) return -1;
      if (b.brand === preferredBrand && a.brand !== preferredBrand) return 1;
    }
    // Ближайший к рабочей точке (центр диапазона)
    const distA = Math.abs(((a.Qmin + a.Qmax) / 2) - Q) + Math.abs(((a.Hmin + a.Hmax) / 2) - H);
    const distB = Math.abs(((b.Qmin + b.Qmax) / 2) - Q) + Math.abs(((b.Hmin + b.Hmax) / 2) - H);
    if (Math.abs(distA - distB) > 1e-6) return distA - distB;
    // По мощности (меньше = энергоэффективнее)
    return a.power - b.power;
  });
}

export function selectBestPump(filter: PumpSelectionFilter): PumpSku | undefined {
  return selectPumps(filter)[0];
}
