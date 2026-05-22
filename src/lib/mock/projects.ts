import type { FireSystem, KnsSystem, Project, SystemConfig, VnsSystem } from '@/lib/types';

const baseTerms = {
  leadTimeWeeks: 11,
  vatPct: 20,
  prepaymentPct: 50,
  warrantyMonths: 12,
  basis: 'DAP' as const,
  validityDays: 30,
  currency: 'RUB' as const,
  usdRate: 82
};

// ============ П-1: Дорогобуж — две пожарные станции ============

const fire552: FireSystem = {
  id: 'sys-fire-552',
  projectId: 'proj-dorogobuzh',
  type: 'FIRE',
  name: 'Насосная станция пожаротушения 552 (АКВМ)',
  status: 'in_proposal',
  data: {
    subtype: 'VPV',
    Q: 38, H: 50,
    source: 'reservoir',
    medium: 'drinking',
    Tmin: 5, Tmax: 15, density: 1000,
    premisesCategory: 'D',
    installLocation: 'inside_premises',
    ambientTemp: 10,
    stationsCount: 1,
    workingPumps: 1, reservePumps: 1,
    driveType: 'electric',
    preferredBrand: 'any',
    avr: true,
    electricalCategory: 1,
    dryRun: true,
    overheat: true,
    ipRating: 'IP55',
    signalToWatchpoint: true,
    signals: {
      pumpsRunning: true, pumpsAlarm: true,
      feed1: true, feed2: true,
      autoMode: true, manualMode: true, stopMode: true,
      avrMode: true, valvesPosition: true
    },
    algorithms: {
      remoteFromHydrant: true,
      autoFromFireDetection: true,
      remoteFromOperator: true,
      localFromStation: true,
      autoReserveOnFailure: true
    },
    collectorSuction: true, collectorPressure: true,
    checkValves: true, flangeKit: true,
    certificateTRTS: true
  },
  createdAt: '2026-04-01T08:00:00Z',
  updatedAt: '2026-04-15T10:00:00Z'
};

const fire552a: FireSystem = {
  id: 'sys-fire-552a',
  projectId: 'proj-dorogobuzh',
  type: 'FIRE',
  name: 'Насосная станция пожаротушения 552А (отгрузка)',
  status: 'in_proposal',
  data: {
    ...fire552.data,
    Q: 320, H: 45,
    medium: 'river'
  },
  createdAt: '2026-04-01T08:30:00Z',
  updatedAt: '2026-04-15T10:00:00Z'
};

export const projectDorogobuzh: Project = {
  id: 'proj-dorogobuzh',
  name: 'ПАО «Дорогобуж» — строительство АКВМ + отгрузка',
  status: 'sent',
  clientId: 'cli-akron',
  primaryContactId: 'ct-shvets',
  object: {
    name: 'ПАО «Дорогобуж». Цех по производству аммиачной селитры',
    region: 'Смоленская обл., Дорогобужский р-н',
    address: 'пгт Верхнеднепровский, промышленная зона',
    projectCode: '74757-05/552, 552А'
  },
  terms: baseTerms,
  systems: [fire552, fire552a],
  createdAt: '2026-04-01T08:00:00Z',
  updatedAt: '2026-04-15T10:00:00Z'
};

// ============ П-2: ЖК Саров — КНС хоз-быт + ливневая ============

const knsHozbyt: KnsSystem = {
  id: 'sys-kns-hozbyt',
  projectId: 'proj-sarov',
  type: 'KNS',
  name: 'КНС хоз-быт (1+1+1)',
  status: 'in_proposal',
  data: {
    subtype: 'hozbyt',
    medium: 'hozbyt',
    Tmin: 5, Tmax: 25, density: 1000,
    exProof: false,
    Qmax: 4.6,
    headRequired: 14.5,
    installation: 'underground_vertical',
    corpusMaterial: 'fiberglass',
    diameter: 1800, depth: 5000, neckHeight: 200,
    underRoadway: false,
    supplyDepth: 3800, supplyDiameter: 200, supplyMaterial: 'PP',
    supplyCount: 1, supplyDirection: 3, supplyConnection: 'socket',
    pressureCount: 2, pressureDepth: 2400, pressureDiameter: 110, pressureMaterial: 'PE',
    pressureLength: 377, pressureGeodeticDelta: 6.8,
    workingPumps: 1, reservePumps: 1, warehousePumps: 1,
    pumpInstallType: 'submersible',
    preferredBrand: 'WILO',
    startType: 'direct',
    panelLocation: 'outdoor', panelDistance: 2, cableDirection: 9,
    avr: false, electricalCategory: 2,
    dispatch: 'none',
    dryRun: true, overheat: true, phaseControl: true,
    basket: true, baffle: false,
    wellBeforeKns: false, wellAfterKns: false,
    flowMeter: 'none',
    gasAnalyzer: true,
    alarmSignal: 'none',
    flexibleHose: false,
    elasticCouplings: false,
    bellowCompensators: false,
    liftingDevice: 'none',
    flangeKit: false,
    strappingBelts: true,
    blockBox: {
      variant: 'frame_module',
      roof: 'flat',
      floor: 'concrete',
      sizeLength: 4.3, sizeWidth: 2.3, sizeHeight: 2.7
    }
  },
  createdAt: '2026-04-02T09:00:00Z',
  updatedAt: '2026-04-10T11:00:00Z'
};

// Принудительно меняем installation на блок-бокс, чтобы добавился блок-бокс в BOM
knsHozbyt.data.installation = 'aboveground_blockbox';

const knsLivnevka: KnsSystem = {
  id: 'sys-kns-livnevka',
  projectId: 'proj-sarov',
  type: 'KNS',
  name: 'ЛНС ливневая (1+1+1)',
  status: 'in_proposal',
  data: {
    subtype: 'livnevka',
    medium: 'livnevka',
    Tmin: 0, Tmax: 25, density: 1000,
    exProof: false,
    Qmax: 128.9,
    headRequired: 17,
    installation: 'aboveground_blockbox',
    corpusMaterial: 'fiberglass',
    diameter: 2200, depth: 7800, neckHeight: 200,
    underRoadway: false,
    supplyDepth: 3120, supplyDiameter: 350, supplyMaterial: 'PP',
    supplyCount: 1, supplyDirection: 3, supplyConnection: 'socket',
    pressureCount: 1, pressureDepth: 2400, pressureDiameter: 250, pressureMaterial: 'PE',
    pressureLength: 203.6, pressureGeodeticDelta: 4,
    workingPumps: 1, reservePumps: 1, warehousePumps: 1,
    pumpInstallType: 'submersible',
    preferredBrand: 'CNP',
    startType: 'soft',
    panelLocation: 'outdoor', panelDistance: 2, cableDirection: 9,
    avr: false, electricalCategory: 2,
    dispatch: 'none',
    dryRun: true, overheat: true, phaseControl: true,
    basket: true, baffle: false,
    wellBeforeKns: false, wellAfterKns: false,
    flowMeter: 'none',
    gasAnalyzer: true,
    alarmSignal: 'none',
    flexibleHose: false,
    elasticCouplings: false,
    bellowCompensators: false,
    liftingDevice: 'none',
    flangeKit: false,
    strappingBelts: true,
    blockBox: {
      variant: 'frame_module',
      roof: 'flat',
      floor: 'concrete',
      sizeLength: 4.8, sizeWidth: 2.7, sizeHeight: 2.7
    }
  },
  createdAt: '2026-04-02T09:30:00Z',
  updatedAt: '2026-04-10T11:00:00Z'
};

export const projectSarov: Project = {
  id: 'proj-sarov',
  name: 'ЖК Саров «Западнее ул. Западной» — корректировка',
  status: 'sent',
  clientId: 'cli-pskspetsgaz',
  primaryContactId: 'ct-sharipova',
  object: {
    name: 'Инженерная и транспортная инфраструктура жилой застройки западнее ул. Западная',
    region: 'Нижегородская обл., г.о.г. Саров',
    address: 'Заречный район',
    projectCode: 'СПЦГ-2026-001'
  },
  terms: { ...baseTerms, leadTimeWeeks: 9 },
  systems: [knsHozbyt, knsLivnevka],
  createdAt: '2026-04-02T09:00:00Z',
  updatedAt: '2026-04-10T11:00:00Z'
};

// ============ П-3: Завод водоподготовки — 5 систем ВНС ============

const vnsBase = {
  Tmin: 10, Tmax: 30, density: 1000,
  startType: 'direct' as const,
  dryRun: true,
  dispatch: 'none' as const,
  panelLocation: 'indoor' as const,
  membraneTank: false
};

const sysOsadok: VnsSystem = {
  id: 'sys-osadok',
  projectId: 'proj-vodopodgotovka',
  type: 'VNS',
  name: 'Насос откачки осадка с отстойника',
  status: 'in_proposal',
  data: {
    ...vnsBase,
    subtype: 'spec_screw',
    medium: 'sludge',
    Qmax: 2, H: 10,
    source: 'tank',
    workingPumps: 1, reservePumps: 0,
    regulation: 'cascade',
    pumpInstallType: 'peristaltic',
    preferredBrand: 'АРЕОПАГ',
    pressureSensor: false
  },
  createdAt: '2026-04-02T10:00:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

const sysPromyvka: VnsSystem = {
  id: 'sys-promyvka',
  projectId: 'proj-vodopodgotovka',
  type: 'VNS',
  name: 'НС промывки фильтров очищенной водой',
  status: 'in_proposal',
  data: {
    ...vnsBase,
    subtype: 'booster_filter_backwash',
    medium: 'drinking',
    Qmax: 90, H: 38,
    source: 'tank',
    workingPumps: 1, reservePumps: 1,
    regulation: 'cascade',
    pumpInstallType: 'vertical_multi',
    preferredBrand: 'Wellmix',
    pressureSensor: false
  },
  createdAt: '2026-04-02T10:15:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

const sysPodacha: VnsSystem = {
  id: 'sys-podacha',
  projectId: 'proj-vodopodgotovka',
  type: 'VNS',
  name: 'НС подачи промывных вод фильтров на очистку',
  status: 'in_proposal',
  data: {
    ...vnsBase,
    subtype: 'booster_production',
    medium: 'tech',
    Qmax: 14, H: 43,
    source: 'tank',
    workingPumps: 1, reservePumps: 1,
    regulation: 'cascade',
    pumpInstallType: 'vertical_multi',
    preferredBrand: 'CNP',
    pressureSensor: true,
    withoutCollector: true
  },
  createdAt: '2026-04-02T10:30:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

const sysFlotoshlam: VnsSystem = {
  id: 'sys-flotoshlam',
  projectId: 'proj-vodopodgotovka',
  type: 'VNS',
  name: 'Насос откачки флотошлама',
  status: 'in_proposal',
  data: {
    ...vnsBase,
    subtype: 'spec_screw',
    medium: 'sludge',
    Qmax: 5, H: 10,
    source: 'tank',
    workingPumps: 1, reservePumps: 0,
    regulation: 'vfd_master',
    pumpInstallType: 'screw',
    preferredBrand: 'СЕТУНЬ ИНЖИНИРИНГ',
    pressureSensor: false,
    panelIncludedInPump: true
  },
  createdAt: '2026-04-02T10:45:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

const sysDrenazh: VnsSystem = {
  id: 'sys-drenazh',
  projectId: 'proj-vodopodgotovka',
  type: 'VNS',
  name: 'НС дренажная (резервная)',
  status: 'in_proposal',
  data: {
    ...vnsBase,
    subtype: 'booster_production',
    medium: 'drenage',
    Qmax: 20, H: 30,
    source: 'tank',
    workingPumps: 1, reservePumps: 1,
    regulation: 'cascade',
    pumpInstallType: 'vertical_multi',
    preferredBrand: 'CNP',
    pressureSensor: true,
    withoutCollector: true
  },
  createdAt: '2026-04-02T11:00:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

export const projectVodopodgotovka: Project = {
  id: 'proj-vodopodgotovka',
  name: 'Завод водоподготовки — 5 систем',
  status: 'ready',
  clientId: 'cli-akvaprom',
  primaryContactId: 'ct-akva-1',
  object: {
    name: 'Цех водоподготовки',
    region: 'Нижегородская обл.',
    projectCode: 'АП-26-001'
  },
  terms: baseTerms,
  systems: [sysOsadok, sysPromyvka, sysPodacha, sysFlotoshlam, sysDrenazh],
  createdAt: '2026-04-02T10:00:00Z',
  updatedAt: '2026-04-02T12:00:00Z'
};

// ============ П-4: Гидроиспытания — насос с ЧРП ============

const sysGidroTest: VnsSystem = {
  id: 'sys-gidro',
  projectId: 'proj-gidroispytaniya',
  type: 'VNS',
  name: 'Насос наполнения / опорожнения аппаратов',
  status: 'calculated',
  data: {
    ...vnsBase,
    subtype: 'spec_vfd_single',
    medium: 'drinking',
    Tmin: 10, Tmax: 35, density: 1000,
    Qmax: 30, H: 20,
    source: 'tank', tankHeight: 3500,
    workingPumps: 1, reservePumps: 0,
    regulation: 'vfd_master',
    pumpInstallType: 'horizontal',
    preferredBrand: 'CNP',
    intermittent: true,
    exProof: false,
    pressureSensor: true,
    panelLocation: 'indoor',
    vfdInsteadOfPanel: true
  },
  createdAt: '2026-04-03T11:00:00Z',
  updatedAt: '2026-04-03T12:00:00Z'
};

export const projectGidro: Project = {
  id: 'proj-gidroispytaniya',
  name: 'Цех гидроиспытаний — центробежный насос с ЧРП',
  status: 'ready',
  clientId: 'cli-metaltech',
  primaryContactId: 'ct-metal-1',
  object: {
    name: 'Отапливаемый цех гидроиспытаний аппаратов',
    region: 'Нижегородская обл.',
    projectCode: 'МТС-26-007'
  },
  terms: { ...baseTerms, leadTimeWeeks: 11, currency: 'USD' },
  systems: [sysGidroTest],
  createdAt: '2026-04-03T11:00:00Z',
  updatedAt: '2026-04-03T12:00:00Z'
};

// ============================================================

export const MOCK_PROJECTS: Project[] = [
  projectDorogobuzh,
  projectSarov,
  projectVodopodgotovka,
  projectGidro
];

export const findProjectById = (id: string) => MOCK_PROJECTS.find(p => p.id === id);
export const findProjectsByClientId = (clientId: string) => MOCK_PROJECTS.filter(p => p.clientId === clientId);
