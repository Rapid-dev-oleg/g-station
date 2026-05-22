// Каталог SKU — насосы, шкафы, аксессуары

import type { Brand } from './common';
import type { Medium, PumpInstallType, StartType, SystemType } from './system';

export type PumpSku = {
  sku: string;
  brand: Brand | string;
  model: string;
  installType: PumpInstallType;
  applicableFor: SystemType[];          // KNS, FIRE, VNS
  medium: Medium[];
  Qmin: number;                          // м³/ч
  Qmax: number;
  Hmin: number;                          // м
  Hmax: number;
  power: number;                         // кВт
  rpm?: number;
  efficiencyClass?: 'IE3' | 'IE4' | 'IE5';
  unitPriceRub: number;
  unitPriceUsd?: number;
  defaultDiscountPct: number;
  deliveryWeeks?: number;
  notes?: string;
};

export type PanelSku = {
  sku: string;
  model: string;                         // ШУФ-223-11к, ЩУН-КНС-МАКС-2x18.5кВт-УХЛ1(О) и т.п.
  applicableFor: SystemType[];
  pumpsCount: 1 | 2 | 3 | 4;
  totalPower: number;                    // суммарная мощность управляемых насосов, кВт
  startType: StartType;
  avr: boolean;
  outdoor: boolean;                      // уличное исполнение
  unitPriceRub: number;
  defaultDiscountPct: number;
  notes?: string;
};

export type VfdSku = {
  sku: string;
  brand: string;
  model: string;
  power: number;                         // кВт
  ipRating?: 'IP55' | 'IP65';
  unitPriceRub: number;
  unitPriceUsd?: number;
  defaultDiscountPct: number;
};

export type CollectorSku = {
  sku: string;
  model: string;                         // 100/80-2-65/40
  description: string;
  diameter: number;                      // мм основной
  branches: number;
  unitPriceRub: number;
  weldingPriceRub: number;               // работы по сварке коллектора
  frameWeldingPriceRub: number;          // работы по сварке рамы
  wiringPriceRub: number;                // расключение
  defaultDiscountPct?: number;
};

export type AccessorySku = {
  sku: string;
  category: 'gas_analyzer' | 'level_float' | 'pressure_sensor' | 'collector_material' | 'frame' | 'wiring' | 'flexible_hose' | 'compensator' | 'strap' | 'other';
  name: string;
  vendor?: string;
  unitPriceRub: number;
  defaultDiscountPct: number;
  notes?: string;
};

export type BlockBoxSku = {
  sku: string;
  model: string;
  variant: 'frame_module' | 'metal_insulated' | 'sandwich' | 'sea_container';
  sizeLength: number;
  sizeWidth: number;
  sizeHeight: number;
  unitPriceRub: number;
  defaultDiscountPct: number;
  forPumpPower?: { min: number; max: number };
};
