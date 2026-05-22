import type { Client } from '@/lib/types';

/**
 * 8 моковых клиентов. Реальные ИНН — только у ПАО «Акрон» (публичная компания).
 * Остальные ИНН синтетические (770000000X).
 */
export const MOCK_CLIENTS: Client[] = [
  {
    id: 'cli-akron',
    inn: '5321029508',
    kpp: '532101001',
    ogrn: '1025300786610',
    shortName: 'ПАО «Акрон»',
    fullName: 'Публичное акционерное общество «Акрон»',
    legalForm: 'PAO',
    legalAddress: '173012, Новгородская обл., г. Великий Новгород, пл. Юбилейная, д. 1',
    contacts: [
      {
        id: 'ct-shvets',
        fullName: 'Швец Николай Николаевич',
        position: 'Инж. группы ВК',
        phone: '+7 (8162) 99-62-08 доб. 5208',
        email: 'NShvets@ing.acron.ru',
        source: 'representative',
        representativeOrg: 'ООО «НПЦ «Акрон инжиниринг»'
      }
    ],
    tags: ['промышленное'],
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-15T10:00:00Z'
  },
  {
    id: 'cli-pskspetsgaz',
    inn: '7700000002',
    kpp: '770001001',
    shortName: 'ООО «ПСК СПЕЦГАЗ»',
    fullName: 'Общество с ограниченной ответственностью «ПСК СПЕЦГАЗ»',
    legalForm: 'OOO',
    legalAddress: '603000, Нижний Новгород, ул. Большая Печёрская, д. 26',
    contacts: [
      {
        id: 'ct-sharipova',
        fullName: 'Шарипова Зульфия Ильшатовна',
        position: 'Главный инженер проекта',
        phone: '+7 917 923-82-88',
        source: 'customer'
      }
    ],
    tags: ['жилищное'],
    createdAt: '2026-03-10T09:00:00Z',
    updatedAt: '2026-04-02T11:30:00Z'
  },
  {
    id: 'cli-akvaprom',
    inn: '7700000003',
    kpp: '770001001',
    shortName: 'ООО «АкваПром Технологии»',
    fullName: 'Общество с ограниченной ответственностью «АкваПром Технологии»',
    legalForm: 'OOO',
    legalAddress: '603000, Нижний Новгород, ул. Заводская, д. 12',
    contacts: [
      {
        id: 'ct-akva-1',
        fullName: 'Иванов Иван Иванович',
        position: 'Главный технолог',
        phone: '+7 831 555-12-34',
        email: 'tech@akvaprom.example',
        source: 'customer'
      }
    ],
    tags: ['промышленное'],
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-04-02T12:00:00Z'
  },
  {
    id: 'cli-metaltech',
    inn: '7700000004',
    kpp: '770001001',
    shortName: 'ООО «МеталлТехСервис»',
    fullName: 'Общество с ограниченной ответственностью «МеталлТехСервис»',
    legalForm: 'OOO',
    legalAddress: '603000, Нижний Новгород, ул. Промышленная, д. 5',
    contacts: [
      {
        id: 'ct-metal-1',
        fullName: 'Петров Сергей Иванович',
        position: 'Главный механик',
        phone: '+7 831 555-33-44',
        email: 'mech@metaltechservice.example',
        source: 'customer'
      }
    ],
    tags: ['промышленное'],
    createdAt: '2026-03-25T10:00:00Z',
    updatedAt: '2026-04-02T13:00:00Z'
  },
  {
    id: 'cli-tnhk',
    inn: '7700000005',
    shortName: 'ОАО «Тюменский НХК»',
    fullName: 'Открытое акционерное общество «Тюменский нефтехимический комбинат»',
    legalForm: 'AO',
    legalAddress: '625000, Тюменская обл., г. Тюмень, ул. Нефтяников, 100',
    contacts: [
      {
        id: 'ct-tnhk-1',
        fullName: 'Сидоров Алексей Викторович',
        position: 'Зам. главного инженера',
        phone: '+7 3452 55-66-77',
        source: 'customer'
      }
    ],
    tags: ['промышленное', 'лид'],
    note: 'Новый лид, ждём ТЗ',
    createdAt: '2026-05-01T09:00:00Z',
    updatedAt: '2026-05-01T09:00:00Z'
  },
  {
    id: 'cli-stroyinvest',
    inn: '7700000006',
    shortName: 'ООО «Стройинвест НН»',
    fullName: 'Общество с ограниченной ответственностью «Стройинвест НН»',
    legalForm: 'OOO',
    legalAddress: '603000, Нижний Новгород, ул. Минина, 15',
    contacts: [
      {
        id: 'ct-stroy-1',
        fullName: 'Кузнецов Михаил Петрович',
        position: 'Менеджер проекта',
        phone: '+7 831 222-11-00',
        source: 'customer'
      }
    ],
    tags: ['жилищное'],
    createdAt: '2026-04-10T10:00:00Z',
    updatedAt: '2026-04-15T10:00:00Z'
  },
  {
    id: 'cli-salavat',
    inn: '7700000007',
    shortName: 'ПАО «Газпром нефтехим Салават»',
    fullName: 'Публичное акционерное общество «Газпром нефтехим Салават»',
    legalForm: 'PAO',
    legalAddress: '453256, Республика Башкортостан, г. Салават, ул. Молодогвардейцев, 30',
    contacts: [
      {
        id: 'ct-salavat-1',
        fullName: 'Габидуллин Радик Маратович',
        position: 'Главный инженер цеха',
        phone: '+7 34763 9-88-77',
        source: 'customer'
      }
    ],
    tags: ['промышленное'],
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-02-28T11:00:00Z'
  },
  {
    id: 'cli-ivanov-ip',
    inn: '770000000888',
    shortName: 'ИП Иванов А.А.',
    fullName: 'Индивидуальный предприниматель Иванов Андрей Андреевич',
    legalForm: 'IP',
    legalAddress: '603000, Нижний Новгород, ул. Большая Покровская, 1',
    contacts: [
      {
        id: 'ct-ip-1',
        fullName: 'Иванов Андрей Андреевич',
        position: 'ИП',
        phone: '+7 920 111-22-33',
        source: 'customer'
      }
    ],
    tags: ['коммерческое'],
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z'
  }
];

export const findClientById = (id: string) => MOCK_CLIENTS.find(c => c.id === id);
export const findClientByInn = (inn: string) => MOCK_CLIENTS.find(c => c.inn === inn);
