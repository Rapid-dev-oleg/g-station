// Типы конкретных инженерных систем

export type SystemType = 'KNS' | 'FIRE' | 'VNS';

export type SystemStatus = 'draft' | 'calculated' | 'in_proposal';

// ============== Общие для всех ==============

export type Medium =
  | 'drinking'         // вода питьевая
  | 'river'            // вода речная
  | 'tech'             // техническая
  | 'hozbyt'           // хоз-бытовые стоки
  | 'livnevka'         // ливневые стоки
  | 'production'       // производственные стоки
  | 'drenage'          // дренаж
  | 'sludge'           // флотошлам / осадок
  | 'mixed';

export type PumpInstallType =
  | 'submersible'      // погружной
  | 'dry_centrifugal'  // сухой центробежный
  | 'vertical_multi'   // вертикальный многоступенчатый
  | 'horizontal'       // горизонтальный консольный
  | 'screw'            // винтовой / шнековый
  | 'peristaltic'      // перистальтический
  | 'diaphragm';       // мембранный

export type StartType = 'direct' | 'star_delta' | 'soft' | 'vfd';

export type PanelLocation = 'outdoor' | 'indoor';

export type DispatchKind = 'none' | 'gsm' | 'ethernet' | 'modbus_rtu' | 'opc_ua';

// ============== КНС ==============

export type KnsSubtype = 'hozbyt' | 'livnevka' | 'production' | 'drenage';
export type KnsCorpusMaterial = 'PE' | 'fiberglass' | 'concrete' | 'stainless';

export type KnsData = {
  subtype: KnsSubtype;
  medium: Medium;
  Tmin: number;          // °C
  Tmax: number;
  density: number;       // кг/м³
  exProof: boolean;      // взрывозащищённость

  // Гидравлика
  Qmax: number;          // м³/ч
  Qavg?: number;
  Qmin?: number;
  Kgen?: number;         // коэф. неравномерности
  hoursPerDay?: number;
  headRequired: number;  // расчётный напор на выходе из КНС, м

  // Корпус
  installation: 'underground_vertical' | 'underground_horizontal' | 'aboveground_blockbox';
  corpusMaterial: KnsCorpusMaterial;
  diameter: number;      // мм: 1200/1600/1800/2000/2300/3000/3200/3500/3700
  depth: number;         // мм
  neckHeight?: number;
  underRoadway: boolean; // под проезжей частью
  hatchClass?: 'A15' | 'B125' | 'D400';
  groundwaterLevel?: number;
  soilType?: 'normal' | 'pucinistyy' | 'rocky';

  // Подвод
  supplyDepth: number;    // мм
  supplyDiameter: number;
  supplyMaterial: 'PP' | 'PVC' | 'castiron' | 'stainless' | 'PE';
  supplyCount: number;
  supplyDirection: number; // 12/3/6/9 час
  supplyConnection: 'socket' | 'flange' | 'welded';

  // Напор
  pressureCount: number;  // 1 / 2
  pressureDepth: number;
  pressureDiameter: number;
  pressureMaterial: 'PE' | 'PP' | 'steel' | 'stainless';
  pressureLength: number; // м
  pressureGeodeticDelta: number; // Δh м
  pressureBendsCount?: number;
  pressureValvesCount?: number;

  // Насосы
  workingPumps: number;
  reservePumps: number;
  warehousePumps: number;
  pumpInstallType: PumpInstallType;
  preferredBrand?: 'CNP' | 'WILO' | 'Grundfos' | 'Wellmix' | 'any';
  startType: StartType;
  vfdMode?: 'none' | 'master' | 'each';

  // Шкаф управления
  panelLocation: PanelLocation;
  panelDistance?: number;  // м от КНС
  cableDirection?: number; // час
  avr: boolean;
  electricalCategory?: 1 | 2 | 3;
  dispatch: DispatchKind;
  dryRun: boolean;
  overheat: boolean;
  phaseControl: boolean;

  // Опции/комплектация
  basket: boolean;          // корзина для мусора
  baffle: boolean;          // отбойник на входе
  wellBeforeKns: boolean;
  wellAfterKns: boolean;
  gasShockAbsorbers?: boolean;
  flowMeter: 'none' | 'electromagnetic' | 'ultrasonic';
  gasAnalyzer: boolean;
  alarmSignal: 'none' | 'siren' | 'flasher';
  flexibleHose: boolean;
  elasticCouplings: boolean;
  bellowCompensators: boolean;
  liftingDevice: 'none' | 'manual_hoist' | 'electric_telpher';
  flangeKit: boolean;
  strappingBelts: boolean;

  // Блок-бокс (если наземная)
  blockBox?: {
    variant: 'frame_module' | 'metal_insulated' | 'sandwich' | 'sea_container';
    roof: 'flat' | 'pitched_one' | 'pitched_two' | 'removable';
    floor: 'concrete' | 'metal_decking';
    sizeLength: number;   // м
    sizeWidth: number;
    sizeHeight: number;
    heating?: boolean;
    ventilation?: boolean;
    lighting?: boolean;
  };
};

// ============== Пожаротушение ==============

export type FireSubtype =
  | 'VPV'              // внутренний пожарный водопровод
  | 'AUPT_sprinkler'   // АУПТ спринклерная
  | 'AUPT_drencher'    // АУПТ дренчерная
  | 'fine_spray'       // тонкораспылённая
  | 'foam'             // пенная
  | 'combined';        // объединённая с хоз-питьевой

export type FireData = {
  subtype: FireSubtype;
  functionalClass?: 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
  buildingCategory?: 'A' | 'B' | 'V' | 'G' | 'D';
  floors?: number;
  height?: number;
  protectedArea?: number;
  hazardZoneClass?: 'none' | 'V-I' | 'V-Ia' | 'V-Ib' | 'V-II';

  // Гидравлика
  Q: number;                // м³/ч
  H: number;                // м вод.ст.
  streamsCount?: number;
  pressureAtNozzle?: number; // МПа
  workTime?: number;         // мин
  compactStreamHeight?: 8 | 12 | 16;
  dictatingElevation?: number; // м

  // Источник
  source: 'city_water' | 'reservoir' | 'artesian_well';
  cityGuaranteedHead?: number;
  reservoirVolume?: number;
  refillRate?: number;

  // Среда
  medium: 'drinking' | 'river' | 'tech';
  Tmin: number;
  Tmax: number;
  density: number;

  // Помещение
  premisesCategory?: 'A' | 'B' | 'V' | 'G' | 'D';
  premisesHazardZone?: string;
  ambientTemp?: number;
  installLocation: 'separate_building' | 'inside_premises';

  // Насосы
  stationsCount: number;       // 1
  workingPumps: number;
  reservePumps: number;
  jockeyPump?: boolean;
  driveType: 'electric' | 'electric_with_diesel';
  preferredBrand?: 'G-Fire' | 'WILO' | 'Grundfos' | 'CNP' | 'any';

  // Шкаф управления
  avr: boolean;
  electricalCategory: 1;
  dryRun: boolean;
  overheat: boolean;
  ipRating: 'IP54' | 'IP55' | 'IP65';
  protectionPort?: string;
  signalToWatchpoint: boolean;
  signals: {
    pumpsRunning: boolean;
    pumpsAlarm: boolean;
    feed1: boolean;
    feed2: boolean;
    autoMode: boolean;
    manualMode: boolean;
    stopMode: boolean;
    avrMode: boolean;
    valvesPosition: boolean;
  };

  // Алгоритм
  algorithms: {
    remoteFromHydrant: boolean;
    autoFromFireDetection: boolean;
    remoteFromOperator: boolean;
    localFromStation: boolean;
    autoReserveOnFailure: boolean;
  };

  // Обвязка
  collectorSuction: boolean;
  collectorPressure: boolean;
  checkValves: boolean;
  flangeKit: boolean;
  certificateTRTS: boolean;
};

// ============== ВНС (повышение давления / водоснабжение / спец-насосы) ==============

export type VnsSubtype =
  | 'booster_drinking'   // хоз-питьевое повышение давления
  | 'booster_production' // производственное
  | 'booster_filter_backwash'
  | 'booster_dosage'
  | 'spec_screw'         // винтовой/перистальтический спец-насос
  | 'spec_vfd_single';   // одиночный насос с ЧРП

export type VnsData = {
  subtype: VnsSubtype;
  medium: Medium;
  Tmin: number;
  Tmax: number;
  density: number;
  hasSuspendedSolids?: boolean;
  waterQuality?: 'sanpin' | 'tech' | 'hot' | 'sludge';

  // Гидравлика
  Qmax: number;
  Qavg?: number;
  Qmin?: number;
  H: number;                // потребный напор, м
  geodeticHead?: number;
  freeHeadAtPoint?: number;
  cityGuaranteedHead?: number;
  consumptionProfile?: 'uniform' | 'peak';

  // Источник
  source: 'city_water' | 'reservoir' | 'artesian_well' | 'tank';
  tankHeight?: number;       // мм

  // Схема установки
  workingPumps: number;
  reservePumps: number;
  warehousePumps?: number;
  regulation: 'cascade' | 'vfd_master' | 'vfd_each' | 'cascade_vfd';
  membraneTank?: boolean;
  membraneTankVolume?: number;
  boosterUnit?: boolean;

  // Насосы
  pumpInstallType: PumpInstallType;
  preferredBrand?: 'Grundfos' | 'WILO' | 'CNP' | 'ETT' | 'Wellmix' | 'Pedrollo' | 'АРЕОПАГ' | 'СЕТУНЬ ИНЖИНИРИНГ' | 'any';
  efficiencyClass?: 'IE3' | 'IE4' | 'IE5';
  corpusMaterial?: 'castiron' | 'steel' | 'stainless';
  intermittent?: boolean;    // режим периодический
  exProof?: boolean;

  // Управление
  startType: StartType;
  pressureSensor?: boolean;
  flowMeter?: 'none' | 'electromagnetic' | 'ultrasonic';
  dryRun: boolean;
  dispatch: DispatchKind;
  panelLocation: PanelLocation;

  // Обвязка
  inletFilter?: 'none' | 'coarse' | 'fine';
  manometers?: boolean;
  valves?: boolean;
  checkValves?: boolean;
  elasticCouplings?: boolean;
  compensators?: boolean;
  vibrationDampers?: boolean;
  collectors?: boolean;

  // Комплектация (флаги архитектурных решений)
  withoutCollector?: boolean;       // «без заложения коллекторов» — для компактных установок SP-2
  panelIncludedInPump?: boolean;    // ШУ укомплектован заводом-производителем насоса (СЕТУНЬ ОНВ)
  vfdInsteadOfPanel?: boolean;      // ЧРП управляет напрямую, отдельный ШУ не нужен (TD65)
};

// ============== Объединённый дискриминированный union ==============

export type BomItem = {
  id: string;
  position: number;
  article?: string;
  vendor?: string;
  name: string;
  comment?: string;
  unitPrice: number;       // RUB
  unitPriceUsd?: number;
  quantity: number;
  amount: number;          // unitPrice * quantity
  discountPct: number;
  purchaseCost: number;    // amount * (1 - discount/100)
  group?: 'pump' | 'collector' | 'work' | 'panel' | 'vfd' | 'sensor' | 'accessory' | 'blockbox';
};

export type ComputedResults = {
  selectedPumpSku?: string;
  selectedPanelSku?: string;
  selectedVfdSku?: string;
  velocity?: number;        // скорость в напорном трубопроводе, м/с
  reynolds?: number;
  headLossLength?: number;
  headLossLocal?: number;
  requiredHead?: number;
  reservoirVolume?: number;
  totalPower?: number;      // суммарная установленная мощность
  warnings?: string[];
};

/**
 * Ручные замены оборудования (overrides) — инженер может заменить
 * автоподобранную позицию на альтернативу из каталога. Если поле задано,
 * compute() использует его вместо результата автоматического подбора.
 */
export type SystemOverrides = {
  pumpSku?: string;
  panelSku?: string;
  vfdSku?: string;
  collectorSku?: string;
  blockBoxSku?: string;
  /** SKU аксессуаров, которые надо ИСКЛЮЧИТЬ из автоподбора. */
  removedAccessories?: string[];
  /** Дополнительные позиции, добавленные вручную. */
  extraItems?: BomItem[];
};

interface SystemBase {
  id: string;
  projectId: string;
  name: string;
  status: SystemStatus;
  computed?: ComputedResults;
  bom?: BomItem[];
  totalCost?: number;       // итог закупки, RUB
  overrides?: SystemOverrides;
  createdAt: string;
  updatedAt: string;
}

export interface KnsSystem extends SystemBase {
  type: 'KNS';
  data: KnsData;
}

export interface FireSystem extends SystemBase {
  type: 'FIRE';
  data: FireData;
}

export interface VnsSystem extends SystemBase {
  type: 'VNS';
  data: VnsData;
}

export type SystemConfig = KnsSystem | FireSystem | VnsSystem;
