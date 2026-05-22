import { buildFireBom, buildKnsBom, buildVnsBom } from './bomBuilder';
import { estimateZetaSum, requiredHead } from './hydraulics';
import { selectBestPump } from './pumpSelect';
import { selectPanel } from './panelSelect';
import { fireReserveVolume, knsReservoirVolume } from './reservoir';
import { findPumpBySku } from '@/lib/catalog/pumps';
import { findPanelBySku } from '@/lib/catalog/panels';
import { findVfdBySku, pickVfdForPower, VFDS } from '@/lib/catalog/vfds';
import type { BomItem, ComputedResults, SystemConfig } from '@/lib/types';

export * from './hydraulics';
export * from './pumpSelect';
export * from './panelSelect';
export * from './reservoir';
export * from './bomBuilder';
export * from './findAlternatives';

export type ComputeResult = {
  computed: ComputedResults;
  bom: BomItem[];
  totalCost: number;
};

/**
 * Главный entry-point: считает систему и возвращает результат с BOM и итогом.
 * Идемпотентен: один и тот же config → один и тот же результат.
 *
 * Если задан system.overrides — заменяет автоподобранные позиции на указанные SKU.
 * Позволяет инженеру вручную скорректировать подбор через SkuPicker в UI.
 */
export function compute(system: SystemConfig): ComputeResult {
  if (system.type === 'KNS') return computeKns(system);
  if (system.type === 'FIRE') return computeFire(system);
  return computeVns(system);
}

function computeKns(system: Extract<SystemConfig, { type: 'KNS' }>): ComputeResult {
  const d = system.data;
  const o = system.overrides ?? {};
  const warnings: string[] = [];

  // Гидравлика напорного трубопровода (для живой сводки и валидации)
  const zeta = estimateZetaSum(d.pressureBendsCount ?? 4, d.pressureValvesCount ?? 2);
  const hydraulic = requiredHead(
    d.pressureGeodeticDelta || 0,
    d.Qmax,
    d.pressureDiameter,
    d.pressureLength,
    zeta,
    3
  );

  // Насос: override → авто
  const pump = (o.pumpSku && findPumpBySku(o.pumpSku)) || selectBestPump({
    systemType: 'KNS',
    Q: d.Qmax,
    H: d.headRequired,
    medium: d.medium,
    installType: d.pumpInstallType === 'submersible' ? 'submersible' : undefined,
    preferredBrand: d.preferredBrand
  });

  if (hydraulic.total > d.headRequired * 1.1) {
    warnings.push(`Расчётный напор ${hydraulic.total.toFixed(1)} м превышает проектный ${d.headRequired} м. Проверьте параметры трубопровода.`);
  }

  if (!pump) {
    warnings.push('Не найден насос под рабочую точку. Расширьте каталог или измените параметры.');
    return { computed: { warnings }, bom: [], totalCost: 0 };
  }

  // Шкаф: override → авто
  const panel = (o.panelSku && findPanelBySku(o.panelSku)) || selectPanel({
    systemType: 'KNS',
    pumpsCount: d.workingPumps + d.reservePumps,
    pumpPower: pump.power,
    outdoor: d.panelLocation === 'outdoor'
  });

  const { bom, totalCost } = buildKnsBom(system, pump, panel);

  return {
    computed: {
      selectedPumpSku: pump.sku,
      selectedPanelSku: panel?.sku,
      velocity: hydraulic.velocity,
      reynolds: hydraulic.reynolds,
      headLossLength: hydraulic.headLossLength,
      headLossLocal: hydraulic.headLossLocal,
      requiredHead: hydraulic.total,
      reservoirVolume: knsReservoirVolume(d.Qmax),
      totalPower: pump.power * (d.workingPumps + d.reservePumps + d.warehousePumps),
      warnings
    },
    bom,
    totalCost
  };
}

function computeFire(system: Extract<SystemConfig, { type: 'FIRE' }>): ComputeResult {
  const d = system.data;
  const o = system.overrides ?? {};
  const warnings: string[] = [];

  const pump = (o.pumpSku && findPumpBySku(o.pumpSku)) || selectBestPump({
    systemType: 'FIRE',
    Q: d.Q,
    H: d.H,
    medium: d.medium,
    preferredBrand: d.preferredBrand
  });

  if (!pump) {
    warnings.push('Не найден пожарный насос под рабочую точку.');
    return { computed: { warnings }, bom: [], totalCost: 0 };
  }

  const panel = (o.panelSku && findPanelBySku(o.panelSku)) || selectPanel({
    systemType: 'FIRE',
    pumpsCount: d.workingPumps + d.reservePumps,
    pumpPower: pump.power
  });

  const { bom, totalCost } = buildFireBom(system, pump, panel);

  return {
    computed: {
      selectedPumpSku: pump.sku,
      selectedPanelSku: panel?.sku,
      requiredHead: d.H,
      reservoirVolume: d.workTime ? fireReserveVolume(d.Q, d.workTime) : undefined,
      totalPower: pump.power * (d.workingPumps + d.reservePumps),
      warnings
    },
    bom,
    totalCost
  };
}

function computeVns(system: Extract<SystemConfig, { type: 'VNS' }>): ComputeResult {
  const d = system.data;
  const o = system.overrides ?? {};
  const warnings: string[] = [];

  const installType =
    d.subtype === 'spec_screw' && d.medium === 'sludge' && d.preferredBrand === 'АРЕОПАГ'
      ? 'peristaltic'
      : d.subtype === 'spec_screw'
        ? 'screw'
        : d.subtype === 'spec_vfd_single'
          ? 'horizontal'
          : 'vertical_multi';

  const pump = (o.pumpSku && findPumpBySku(o.pumpSku)) || selectBestPump({
    systemType: 'VNS',
    Q: d.Qmax,
    H: d.H,
    medium: d.medium,
    installType,
    preferredBrand: d.preferredBrand
  });

  if (!pump) {
    warnings.push('Не найден насос ВНС под рабочую точку.');
    return { computed: { warnings }, bom: [], totalCost: 0 };
  }

  const skipPanel = Boolean(d.panelIncludedInPump) || Boolean(d.vfdInsteadOfPanel);
  const panel = skipPanel ? undefined : (
    (o.panelSku && findPanelBySku(o.panelSku)) || selectPanel({
      systemType: 'VNS',
      pumpsCount: d.workingPumps + d.reservePumps,
      pumpPower: pump.power,
      startType: d.startType
    })
  );

  const needsVfd = d.subtype === 'spec_vfd_single' || (d.subtype === 'spec_screw' && d.regulation !== 'cascade');
  const vfd = needsVfd ? (
    (o.vfdSku && findVfdBySku(o.vfdSku)) || pickVfdForPower(pump.power)
  ) : undefined;

  const pressureSensor = Boolean(d.pressureSensor) ||
    d.subtype === 'spec_vfd_single' ||
    d.subtype === 'booster_production';

  const { bom, totalCost } = buildVnsBom(system, pump, panel, vfd, pressureSensor);

  return {
    computed: {
      selectedPumpSku: pump.sku,
      selectedPanelSku: panel?.sku,
      selectedVfdSku: vfd?.sku,
      requiredHead: d.H,
      totalPower: pump.power * (d.workingPumps + d.reservePumps),
      warnings
    },
    bom,
    totalCost
  };
}
