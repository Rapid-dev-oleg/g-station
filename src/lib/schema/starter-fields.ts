/**
 * Стартовые схемы (field-spec) семейств продукции G-* по дереву типов.
 * Модель: СЕМЕЙСТВО = SystemType; СЦЕНАРИЙ и КОНСТРУКТИВ = enum-поля схемы.
 * Значения сценариев/конструктива взяты прямо из карты продукции (не выдуманы).
 * Это ЗАГОТОВКИ — инженер дошлифовывает в конструкторе схем + ИИ-помощником.
 * fire не тут — у него своя проверенная схема (src/lib/schema/fire-fields.ts).
 */
import type { FieldSpec } from './types';

/** Общие гидравлические поля (у всех семейств). */
const HYDRAULICS: FieldSpec[] = [
  { key: 'Q', label: 'Подача Q', dataType: 'measured', unit: 'м³/ч', required: true, provenance: true },
  { key: 'H', label: 'Напор H', dataType: 'measured', unit: 'м', required: true, provenance: true },
  { key: 'working_pumps', label: 'Рабочих насосов', dataType: 'number' },
  { key: 'reserve_pumps', label: 'Резервных насосов', dataType: 'number' },
];

/** Конструктив для FIRE/POWER/WATER (наземные станции). */
const ENCLOSURE_LAND: FieldSpec = {
  key: 'station_enclosure',
  label: 'Конструктив',
  dataType: 'enum',
  hint: 'Исполнение корпуса станции',
  options: [
    { value: 'блок-контейнер', label: 'Блок-контейнер' },
    { value: 'подземная-сталь-стеклопластик', label: 'Подземная (сталь/стеклопластик)' },
    { value: 'на-раме-в-здании', label: 'На раме в здании' },
  ],
};

/** Конструктив для ЛНС/КНС (цепочка: материал → размещение → блок-бокс). */
const ENCLOSURE_KNS: FieldSpec[] = [
  {
    key: 'body_material', label: 'Материал корпуса', dataType: 'enum',
    options: [
      { value: 'стеклопластик', label: 'Стеклопластик' },
      { value: 'металл', label: 'Металл' },
    ],
  },
  {
    key: 'pump_placement', label: 'Размещение насосов', dataType: 'enum',
    options: [
      { value: 'погружная', label: 'Погружная' },
      { value: 'сухой-отсек', label: 'Сухой отсек' },
    ],
  },
  {
    key: 'block_box', label: 'Блок-бокс', dataType: 'enum',
    options: [
      { value: 'с-блок-боксом', label: 'С блок-боксом' },
      { value: 'без-блок-бокса', label: 'Без блок-бокса' },
    ],
  },
];

/** G-POWER — спецсистемы. */
export const POWER_FIELDS: FieldSpec[] = [
  {
    key: 'power_kind', label: 'Тип спецсистемы', dataType: 'enum', required: true,
    options: [
      { value: 'совмещённая-хозпит-пожар', label: 'Совмещённая: хоз-пит + пожар' },
      { value: 'гидромодули', label: 'Гидромодули' },
      { value: 'нестандартные-спецстанции', label: 'Нестандартные спецстанции' },
    ],
  },
  ...HYDRAULICS,
  ENCLOSURE_LAND,
];

/** G-WATER — водоснабжение. */
export const WATER_FIELDS: FieldSpec[] = [
  {
    key: 'water_purpose', label: 'Назначение', dataType: 'enum', required: true,
    options: [
      { value: 'хозяйственно-питьевая', label: 'Хозяйственно-питьевая' },
      { value: 'повышение-давления', label: 'Повышение давления' },
    ],
  },
  ...HYDRAULICS,
  ENCLOSURE_LAND,
];

/** ЛНС — ливневая насосная станция. */
export const LNS_FIELDS: FieldSpec[] = [
  {
    key: 'lns_kind', label: 'Тип ЛНС', dataType: 'enum', required: true,
    options: [
      { value: 'общего-назначения', label: 'Общего назначения' },
      { value: 'совмещённая-с-ЛОС', label: 'Совмещённая с ЛОС' },
    ],
  },
  ...HYDRAULICS,
  ...ENCLOSURE_KNS,
];

/** КНС — канализационная насосная станция. */
export const KNS_FIELDS: FieldSpec[] = [
  {
    key: 'kns_kind', label: 'Тип КНС', dataType: 'enum', required: true,
    options: [
      { value: 'общего-назначения', label: 'Общего назначения' },
    ],
  },
  ...HYDRAULICS,
  ...ENCLOSURE_KNS,
];
