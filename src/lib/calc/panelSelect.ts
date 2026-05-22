import { PANELS } from '@/lib/catalog/panels';
import type { PanelSku, PumpSku, StartType, SystemType } from '@/lib/types';

export function selectPanel(opts: {
  systemType: SystemType;
  pumpsCount: number;
  pumpPower: number;
  startType?: StartType;
  outdoor?: boolean;
}): PanelSku | undefined {
  const { systemType, pumpsCount, pumpPower, startType, outdoor } = opts;

  // Группа 1: пожаротушение (ШУФ / ШУФС)
  if (systemType === 'FIRE') {
    if (pumpPower <= 30) return PANELS.find(p => p.sku === 'SHUF-223-11K');
    return PANELS.find(p => p.sku === 'SHUFS-223-75K');
  }

  // Группа 2: КНС (ЩУН-КНС-МАКС, уличное)
  if (systemType === 'KNS') {
    if (pumpPower <= 5) return PANELS.find(p => p.sku === 'SCHUN-KNS-MAKS-2x1.5');
    return PANELS.find(p => p.sku === 'SCHUN-KNS-MAKS-2x18.5');
  }

  // Группа 3: ВНС / спец-насосы (ШУЧ)
  if (systemType === 'VNS') {
    if (pumpsCount === 1) {
      if (pumpPower <= 2) return PANELS.find(p => p.sku === 'SHUCH-111-1.1K-2D');
      return PANELS.find(p => p.sku === 'SHUCH-113-11K-2D');
    }
    // 1+1
    if (pumpPower >= 14) return PANELS.find(p => p.sku === 'SHUCH-213-15K-4D');
    return PANELS.find(p => p.sku === 'SHUCH-213-11K-4D');
  }
  return undefined;
}
