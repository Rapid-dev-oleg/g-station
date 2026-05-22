/**
 * Поиск альтернатив в каталоге — для drop-down с заменой автоподбора.
 * Каждая функция принимает фильтр совместимости и поисковую строку,
 * возвращает ранжированный список SKU.
 */

import { ACCESSORIES } from '@/lib/catalog/accessories';
import { BLOCK_BOXES } from '@/lib/catalog/accessories';
import { COLLECTORS } from '@/lib/catalog/collectors';
import { PANELS } from '@/lib/catalog/panels';
import { PUMPS } from '@/lib/catalog/pumps';
import { VFDS } from '@/lib/catalog/vfds';
import type {
  AccessorySku, BlockBoxSku, CollectorSku, Medium, PanelSku, PumpSku, StartType, SystemType, VfdSku
} from '@/lib/types';

export type CompatibilityLevel = 'exact' | 'compatible' | 'override' | 'incompatible';

export type Alternative<T> = {
  sku: T;
  compatibility: CompatibilityLevel;
  reason: string;        // короткое пояснение почему подходит / отличается
  priceDelta?: number;   // ₽ относительно текущего выбора
};

const matchesSearch = (text: string, q: string) => {
  if (!q.trim()) return true;
  const needle = q.toLowerCase().trim();
  return text.toLowerCase().includes(needle);
};

// =================================================================
// НАСОСЫ
// =================================================================

export type PumpAltFilter = {
  systemType: SystemType;
  Q: number;
  H: number;
  medium?: Medium;
  currentSku?: string;
  search?: string;
};

export function findAlternativePumps(filter: PumpAltFilter): Alternative<PumpSku>[] {
  const { systemType, Q, H, medium, currentSku, search = '' } = filter;
  const current = currentSku ? PUMPS.find(p => p.sku === currentSku) : undefined;

  return PUMPS
    .filter(p => matchesSearch(`${p.brand} ${p.model} ${p.sku}`, search))
    .map((p): Alternative<PumpSku> | null => {
      const sameSystem = p.applicableFor.includes(systemType);
      const fitsQ = Q >= p.Qmin && Q <= p.Qmax;
      const fitsH = H === 0 || (H >= p.Hmin && H <= p.Hmax);
      const fitsMedium = !medium || p.medium.includes(medium);

      // Полная несовместимость — не показываем
      if (!sameSystem) return null;

      let compatibility: CompatibilityLevel;
      let reason: string;
      if (fitsQ && fitsH && fitsMedium) {
        compatibility = currentSku === p.sku ? 'exact' : 'compatible';
        reason = `${p.Qmin}–${p.Qmax} м³/ч, ${p.Hmin}–${p.Hmax} м, ${p.power} кВт`;
      } else {
        compatibility = 'override';
        const issues: string[] = [];
        if (!fitsQ) issues.push(`Q ${p.Qmin}–${p.Qmax} вне ${Q}`);
        if (!fitsH) issues.push(`H ${p.Hmin}–${p.Hmax} вне ${H}`);
        if (!fitsMedium) issues.push(`среда ${p.medium.join('/')}`);
        reason = `⚠ ${issues.join('; ')}`;
      }

      const priceDelta = current ? p.unitPriceRub - current.unitPriceRub : undefined;
      return { sku: p, compatibility, reason, priceDelta };
    })
    .filter((x): x is Alternative<PumpSku> => x !== null)
    .sort((a, b) => {
      const order = { exact: 0, compatible: 1, override: 2, incompatible: 3 } as const;
      if (order[a.compatibility] !== order[b.compatibility]) {
        return order[a.compatibility] - order[b.compatibility];
      }
      return a.sku.unitPriceRub - b.sku.unitPriceRub;
    });
}

// =================================================================
// ШКАФЫ УПРАВЛЕНИЯ
// =================================================================

export type PanelAltFilter = {
  systemType: SystemType;
  pumpsCount: number;
  pumpPower: number;
  startType?: StartType;
  currentSku?: string;
  search?: string;
};

export function findAlternativePanels(filter: PanelAltFilter): Alternative<PanelSku>[] {
  const { systemType, pumpsCount, pumpPower, currentSku, search = '' } = filter;
  const current = currentSku ? PANELS.find(p => p.sku === currentSku) : undefined;
  const required = pumpsCount * pumpPower;

  return PANELS
    .filter(p => matchesSearch(`${p.model} ${p.sku}`, search))
    .map((p): Alternative<PanelSku> | null => {
      if (!p.applicableFor.includes(systemType)) return null;

      const fitsCount = p.pumpsCount >= pumpsCount;
      const fitsPower = p.totalPower >= required * 0.9; // 10% запас допускаем

      let compatibility: CompatibilityLevel;
      let reason: string;
      if (fitsCount && fitsPower) {
        compatibility = currentSku === p.sku ? 'exact' : 'compatible';
        reason = `до ${p.pumpsCount} нас., ${p.totalPower} кВт, пуск: ${p.startType}`;
      } else {
        compatibility = 'override';
        const issues: string[] = [];
        if (!fitsCount) issues.push(`на ${p.pumpsCount} нас. < ${pumpsCount}`);
        if (!fitsPower) issues.push(`${p.totalPower} кВт < ${required.toFixed(1)}`);
        reason = `⚠ ${issues.join('; ')}`;
      }

      return {
        sku: p,
        compatibility,
        reason,
        priceDelta: current ? p.unitPriceRub - current.unitPriceRub : undefined
      };
    })
    .filter((x): x is Alternative<PanelSku> => x !== null)
    .sort((a, b) => {
      const order = { exact: 0, compatible: 1, override: 2, incompatible: 3 } as const;
      if (order[a.compatibility] !== order[b.compatibility]) {
        return order[a.compatibility] - order[b.compatibility];
      }
      return a.sku.unitPriceRub - b.sku.unitPriceRub;
    });
}

// =================================================================
// ЧРП
// =================================================================

export type VfdAltFilter = {
  pumpPower: number;
  currentSku?: string;
  search?: string;
};

export function findAlternativeVfds(filter: VfdAltFilter): Alternative<VfdSku>[] {
  const { pumpPower, currentSku, search = '' } = filter;
  const current = currentSku ? VFDS.find(v => v.sku === currentSku) : undefined;

  return VFDS
    .filter(v => matchesSearch(`${v.brand} ${v.model} ${v.sku}`, search))
    .map((v): Alternative<VfdSku> => {
      const fits = v.power >= pumpPower * 0.95;
      return {
        sku: v,
        compatibility: !fits ? 'override' : (currentSku === v.sku ? 'exact' : 'compatible'),
        reason: fits
          ? `${v.power} кВт, ${v.ipRating ?? 'IP54'}`
          : `⚠ мощность ${v.power} кВт < требуемой ${pumpPower}`,
        priceDelta: current ? v.unitPriceRub - current.unitPriceRub : undefined
      };
    })
    .sort((a, b) => {
      const order = { exact: 0, compatible: 1, override: 2, incompatible: 3 } as const;
      return order[a.compatibility] - order[b.compatibility];
    });
}

// =================================================================
// КОЛЛЕКТОРЫ
// =================================================================

export type CollectorAltFilter = {
  diameterHint?: number;
  currentSku?: string;
  search?: string;
};

export function findAlternativeCollectors(filter: CollectorAltFilter): Alternative<CollectorSku>[] {
  const { currentSku, search = '' } = filter;
  const current = currentSku ? COLLECTORS.find(c => c.sku === currentSku) : undefined;

  return COLLECTORS
    .filter(c => matchesSearch(`${c.model} ${c.description} ${c.sku}`, search))
    .map((c): Alternative<CollectorSku> => ({
      sku: c,
      compatibility: currentSku === c.sku ? 'exact' : 'compatible',
      reason: `DN ${c.diameter}, ${c.branches} ветв., ${c.description}`,
      priceDelta: current ? c.unitPriceRub - current.unitPriceRub : undefined
    }));
}

// =================================================================
// АКСЕССУАРЫ
// =================================================================

export type AccessoryAltFilter = {
  category?: AccessorySku['category'];
  currentSku?: string;
  search?: string;
};

export function findAlternativeAccessories(filter: AccessoryAltFilter): Alternative<AccessorySku>[] {
  const { category, currentSku, search = '' } = filter;
  const current = currentSku ? ACCESSORIES.find(a => a.sku === currentSku) : undefined;

  return ACCESSORIES
    .filter(a => !category || a.category === category)
    .filter(a => matchesSearch(`${a.vendor ?? ''} ${a.name} ${a.sku}`, search))
    .map((a): Alternative<AccessorySku> => ({
      sku: a,
      compatibility: currentSku === a.sku ? 'exact' : 'compatible',
      reason: a.notes ?? a.category,
      priceDelta: current ? a.unitPriceRub - current.unitPriceRub : undefined
    }));
}

// =================================================================
// БЛОК-БОКСЫ
// =================================================================

export type BlockBoxAltFilter = {
  pumpPower?: number;
  currentSku?: string;
  search?: string;
};

export function findAlternativeBlockBoxes(filter: BlockBoxAltFilter): Alternative<BlockBoxSku>[] {
  const { pumpPower, currentSku, search = '' } = filter;
  const current = currentSku ? BLOCK_BOXES.find(b => b.sku === currentSku) : undefined;

  return BLOCK_BOXES
    .filter(b => matchesSearch(`${b.model} ${b.variant} ${b.sku}`, search))
    .map((b): Alternative<BlockBoxSku> => {
      const fits = !pumpPower || !b.forPumpPower
        || (pumpPower >= b.forPumpPower.min && pumpPower <= b.forPumpPower.max);
      return {
        sku: b,
        compatibility: !fits ? 'override' : (currentSku === b.sku ? 'exact' : 'compatible'),
        reason: `${b.sizeLength}×${b.sizeWidth}×${b.sizeHeight} м, ${b.variant}`,
        priceDelta: current ? b.unitPriceRub - current.unitPriceRub : undefined
      };
    });
}
