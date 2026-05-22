export type SystemTypeKey = 'KNS' | 'FIRE' | 'VNS';
export type StandardKind = 'SP' | 'GOST' | 'SNIP' | 'OTHER';
export type StandardStatus = 'active' | 'recommended' | 'cancelled';

export type StandardCard = {
  /** Уникальный идентификатор (генерируется или равен коду для встроенных). */
  id: string;
  code: string;
  title: string;
  scope: string;
  kind: StandardKind;
  appliesTo: SystemTypeKey[];
  keyPoints: string[];
  status: StandardStatus;
  /** Ссылка на источник (docs.cntd.ru, kodeks, минстрой и т.п.). */
  sourceUrl?: string;
  /** Год редакции для сортировки. */
  year?: number;
  /** Кто добавил: 'system' — встроенный, 'user' — добавлен менеджером. */
  origin: 'system' | 'user';
  note?: string;
  createdAt?: string;
};

/**
 * Встроенные нормативы. Берутся как seed при первой загрузке;
 * пользовательские добавления хранятся в localStorage.
 */
export const SEED_STANDARDS: StandardCard[] = [
  {
    id: 'sp-30-13330-2020',
    code: 'СП 30.13330.2020',
    title: 'Внутренний водопровод и канализация зданий',
    scope: 'Проектирование внутренних систем водоснабжения и канализации.',
    kind: 'SP',
    appliesTo: ['VNS', 'FIRE'],
    keyPoints: [
      'Расходы воды на сан-приборы',
      'Минимальный свободный напор у диктующего прибора',
      'Допуски по температурам Х/В и Г/В',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/573800442',
    year: 2020,
    origin: 'system',
  },
  {
    id: 'sp-31-13330-2021',
    code: 'СП 31.13330.2021',
    title: 'Водоснабжение. Наружные сети и сооружения',
    scope: 'Наружное водоснабжение населённых пунктов и промплощадок.',
    kind: 'SP',
    appliesTo: ['VNS'],
    keyPoints: [
      'Категории надёжности систем',
      'Запас воды на хоз-питьевые и пожарные нужды',
      'Подбор насосного оборудования',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/728503488',
    year: 2021,
    origin: 'system',
  },
  {
    id: 'sp-32-13330-2018',
    code: 'СП 32.13330.2018',
    title: 'Канализация. Наружные сети и сооружения',
    scope: 'Проектирование наружных сетей канализации и КНС.',
    kind: 'SP',
    appliesTo: ['KNS'],
    keyPoints: [
      'Регулирующий объём приёмного резервуара',
      'Минимальные скорости в напорных трубопроводах',
      'Кратность включений насосов в час (до 6)',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/554820821',
    year: 2018,
    origin: 'system',
  },
  {
    id: 'sp-10-13130-2020',
    code: 'СП 10.13130.2020',
    title: 'Внутренний противопожарный водопровод',
    scope: 'Проектирование ВПВ и насосных установок для них.',
    kind: 'SP',
    appliesTo: ['FIRE'],
    keyPoints: [
      'Расходы и число струй (1×2,5 л/с — для большинства)',
      'Высота компактной струи (8, 12, 16 м)',
      'Время работы (60 мин по умолчанию)',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/566248580',
    year: 2020,
    origin: 'system',
  },
  {
    id: 'sp-8-13130-2009',
    code: 'СП 8.13130.2009',
    title: 'Наружное противопожарное водоснабжение',
    scope: 'Источники наружного пожаротушения, резервуары, гидранты.',
    kind: 'SP',
    appliesTo: ['FIRE'],
    keyPoints: [
      'Объём пожарного резерва (по 3 часа работы)',
      'Минимальные расстояния от водоисточника',
      'Типы и количество гидрантов',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/1200071152',
    year: 2009,
    origin: 'system',
  },
  {
    id: 'sp-5-13130-2009',
    code: 'СП 5.13130.2009',
    title: 'Системы пожарной сигнализации и пожаротушения',
    scope: 'АПС, АУПТ — спринклерные, дренчерные, тонкораспылённые.',
    kind: 'SP',
    appliesTo: ['FIRE'],
    keyPoints: [
      'Интенсивность орошения и площади',
      'Объём гидравлической секции',
      'Время реакции автоматики',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/1200071148',
    year: 2009,
    origin: 'system',
  },
  {
    id: 'sp-12-13130-2009',
    code: 'СП 12.13130.2009',
    title: 'Определение категорий помещений по взрывопожарной опасности',
    scope: 'Категории А, Б, В1-В4, Г, Д.',
    kind: 'SP',
    appliesTo: ['FIRE', 'KNS'],
    keyPoints: [
      'Категория D — для большинства насосных',
      'Категория А/Б — для нефтехим',
      'Влияние на исполнение электрооборудования',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/1200071156',
    year: 2009,
    origin: 'system',
  },
  {
    id: 'gost-12-2-085-2017',
    code: 'ГОСТ 12.2.085-2017',
    title: 'Сосуды, работающие под давлением',
    scope: 'Требования к безопасности сосудов и арматуры.',
    kind: 'GOST',
    appliesTo: ['FIRE', 'VNS'],
    keyPoints: [
      'Предохранительные клапаны',
      'Манометры и температурные приборы',
      'Маркировка и техническое освидетельствование',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/1200147341',
    year: 2017,
    origin: 'system',
  },
  {
    id: 'gost-3634-2019',
    code: 'ГОСТ 3634-2019',
    title: 'Люки смотровых колодцев и дождеприёмников',
    scope: 'Классы нагрузки A15 / B125 / D400 для люков.',
    kind: 'GOST',
    appliesTo: ['KNS'],
    keyPoints: [
      'A15 — пешеходные зоны',
      'B125 — придомовые, паркинги',
      'D400 — под проезжей частью',
    ],
    status: 'active',
    sourceUrl: 'https://docs.cntd.ru/document/1200166104',
    year: 2019,
    origin: 'system',
  },
  {
    id: 'sp-131-13330-2020',
    code: 'СП 131.13330.2020',
    title: 'Строительная климатология',
    scope: 'Расчётные температуры наружного воздуха.',
    kind: 'SP',
    appliesTo: ['KNS', 'FIRE', 'VNS'],
    keyPoints: [
      'Расчётная зимняя для отопления',
      'Глубина промерзания грунта',
      'Подбор обогрева и теплоизоляции',
    ],
    status: 'recommended',
    sourceUrl: 'https://docs.cntd.ru/document/573659358',
    year: 2020,
    origin: 'system',
  },
];

/** Совместимость со старым кодом, который импортировал STANDARDS. */
export const STANDARDS = SEED_STANDARDS;
