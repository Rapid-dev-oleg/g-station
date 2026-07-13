/**
 * Field-spec типа G-FIRE (пожаротушение) — «опросный лист как данные».
 *
 * Пилот Фазы 1 конструктора схем: текущая захардкоженная карточка пожарной
 * станции (IntakeFlow/StationInput) выражена данными. Из него строится
 * динамическая форма ревью и опросный лист для агента. Ключи (`key`) совпадают
 * с полями dossier.stations[].input — хранение и конвейер не меняются.
 */
import type { TypeFieldSpec } from './types';

export const FIRE_FIELDS: TypeFieldSpec = [
  {
    key: 'purpose',
    label: 'Назначение станции',
    dataType: 'enum',
    required: true,
    options: [
      { value: 'наружное-ПТ', label: 'Наружное пожаротушение' },
      { value: 'ВПВ', label: 'Внутренний противопожарный водопровод' },
      { value: 'АУПТ', label: 'АУПТ (спринклер/дренчер)' },
      { value: 'пожаротушение-общее', label: 'Пожаротушение (общее)' },
      { value: 'хоз-питьевое', label: 'Хоз-питьевое' },
      { value: 'повышение-давления', label: 'Повышение давления' },
      { value: 'береговая-ПНС', label: 'Береговая ПНС' },
    ],
  },
  { key: 'Q', label: 'Подача Q', dataType: 'measured', unit: 'м³/ч', required: true, provenance: true },
  { key: 'H', label: 'Напор H', dataType: 'measured', unit: 'м', required: true, provenance: true },
  { key: 'system_pressure', label: 'Давление в системе', dataType: 'measured', unit: 'м', provenance: true },
  { key: 'inlet_pressure', label: 'Давление на вводе', dataType: 'measured', unit: 'м', provenance: true },
  {
    key: 'reservation_scheme',
    label: 'Схема резервирования',
    dataType: 'enum',
    hint: 'Если не задана — определит расчёт (дефолт 1/1).',
    options: [
      { value: '1/0', label: '1/0 (один рабочий, без резерва)' },
      { value: '1/1', label: '1/1 (один рабочий, один резервный)' },
      { value: '2/1', label: '2/1 (два рабочих, один резервный)' },
      { value: '2/2', label: '2/2 (два рабочих, два резервных)' },
      { value: '3/1', label: '3/1 (три рабочих, один резервный)' },
    ],
  },
  { key: 'working_pumps', label: 'Рабочих насосов', dataType: 'number' },
  { key: 'reserve_pumps', label: 'Резервных насосов', dataType: 'number' },
  { key: 'jockey_required', label: 'Жокей-насос', dataType: 'boolean' },
  { key: 'jockey_Q', label: 'Подача жокея', dataType: 'measured', unit: 'м³/ч', provenance: true, visibleIf: { field: 'jockey_required', equals: [true] } },
  { key: 'jockey_H', label: 'Напор жокея', dataType: 'measured', unit: 'м', provenance: true, visibleIf: { field: 'jockey_required', equals: [true] } },
  {
    key: 'start_type',
    label: 'Тип пуска',
    dataType: 'enum',
    hint: 'Для пожарных по умолчанию прямой (надёжность).',
    options: [
      { value: 'прямой', label: 'Прямой' },
      { value: 'плавный', label: 'Плавный (УПП)' },
      { value: 'частотный', label: 'Частотный (ПЧ)' },
      { value: 'каскадный', label: 'Каскадный' },
    ],
  },
  {
    key: 'collector_material',
    label: 'Материал коллектора',
    dataType: 'enum',
    options: [
      { value: 'углеродистая-сталь', label: 'Углеродистая сталь (Ст.20)' },
      { value: 'нержавеющая-сталь', label: 'Нержавеющая сталь (AISI 304)' },
    ],
  },
  {
    key: 'station_enclosure',
    label: 'Исполнение станции',
    dataType: 'enum',
    options: [
      { value: 'моноблок-на-раме', label: 'Моноблок на раме' },
      { value: 'технологический-павильон', label: 'Технологический павильон' },
      { value: 'блок-бокс', label: 'Блок-бокс' },
      { value: 'подземное-стеклопластик', label: 'Подземное (стеклопластик)' },
      { value: 'стеклопластиковый-колодец', label: 'Стеклопластиковый колодец' },
      { value: 'в-чужом-резервуаре', label: 'В чужом резервуаре' },
      { value: 'береговой-модуль', label: 'Береговой модуль' },
    ],
  },
  {
    key: 'installation_place',
    label: 'Место установки',
    dataType: 'enum',
    options: [
      { value: 'в-помещении', label: 'В помещении' },
      { value: 'под-заливом', label: 'Под заливом' },
      { value: 'заглублённая', label: 'Заглублённая' },
      { value: 'на-берегу', label: 'На берегу' },
    ],
  },
  { key: 'pump_type_required', label: 'Требуемый тип насоса', dataType: 'text', hint: 'Если задан в ТЗ (напр. горизонтальный, in-line).' },
  {
    key: 'fire_params',
    label: 'Пожарные параметры',
    dataType: 'group',
    fields: [
      { key: 'fire_duration', label: 'Продолжительность пожара', dataType: 'measured', unit: 'мин', provenance: true },
      { key: 'fire_flow_rate', label: 'Расход на тушение', dataType: 'measured', unit: 'л/с', provenance: true },
      { key: 'streams_count', label: 'Число струй', dataType: 'number' },
      { key: 'stream_flow', label: 'Расход струи', dataType: 'measured', unit: 'л/с', provenance: true },
      { key: 'replenishment_time', label: 'Время восполнения', dataType: 'measured', unit: 'ч', provenance: true },
    ],
  },
  {
    key: 'reservoirs',
    label: 'Резервуары',
    dataType: 'group',
    fields: [
      { key: 'required', label: 'Требуются', dataType: 'boolean' },
      { key: 'count', label: 'Количество', dataType: 'number' },
      { key: 'volume', label: 'Объём', dataType: 'measured', unit: 'м³', provenance: true },
      {
        key: 'material',
        label: 'Материал',
        dataType: 'enum',
        options: [
          { value: 'сборный-металл', label: 'Сборный металл' },
          { value: 'стеклопластик', label: 'Стеклопластик' },
          { value: 'бетонный-чужой', label: 'Бетонный (чужой)' },
        ],
      },
    ],
  },
  {
    key: 'power_supply',
    label: 'Электроснабжение',
    dataType: 'group',
    fields: [
      {
        key: 'category',
        label: 'Категория надёжности',
        dataType: 'enum',
        options: [
          { value: 'I', label: 'I' },
          { value: 'II', label: 'II' },
          { value: 'III', label: 'III' },
        ],
      },
      { key: 'inputs', label: 'Число вводов', dataType: 'number' },
      { key: 'avr', label: 'АВР', dataType: 'boolean' },
      { key: 'from_generator', label: 'От генератора', dataType: 'boolean' },
    ],
  },
];
