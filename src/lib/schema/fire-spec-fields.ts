/**
 * Стартовая СХЕМА СПЕЦИФИКАЦИИ (состав оборудования) для G-FIRE.
 *
 * Третье измерение типа: ввод (TypeSchema) → СПЕЦИФИКАЦИЯ (это) → карточка (cardLayout).
 * Тот же field-spec, что и схема ввода, но описывает ВЫХОД — позиции состава,
 * которые заполняет подбор (шаг 3). Сгруппировано по разделам спецификации;
 * эталон структуры — `Equipment` из расчётного дела (src/lib/dossier/types.ts).
 *
 * Хранится в SystemType.specSchema (FieldSpec[]). Заготовка — инженер шлифует в
 * конструкторе + ИИ-помощником (как схему ввода). Значения enum — из скила/номенклатуры.
 */
import type { FieldSpec } from './types';

export const FIRE_SPEC_FIELDS: FieldSpec[] = [
  {
    key: 'pumps', label: 'Насосная группа', dataType: 'group',
    fields: [
      {
        key: 'main_pump_class', label: 'Класс насоса', dataType: 'enum',
        options: [
          { value: 'END_SUCTION', label: 'Консольный (end-suction)' },
          { value: 'SPLIT_CASE', label: 'С осевым разъёмом (split-case)' },
          { value: 'MULTISTAGE', label: 'Многоступенчатый' },
          { value: 'IN_LINE', label: 'Ин-лайн' },
        ],
      },
      { key: 'main_pump_size', label: 'Типоразмер основного насоса', dataType: 'text', hint: 'Точная модель/бренд — подтверждает инженер' },
      { key: 'main_pump_power', label: 'Мощность двигателя', dataType: 'measured', unit: 'кВт' },
      { key: 'main_pump_qty', label: 'Число насосов (раб.+рез.)', dataType: 'number' },
      { key: 'jockey_pump', label: 'Жокей-насос', dataType: 'text', hint: 'Вертикальный многоступенчатый, если нужен' },
      { key: 'membrane_tank', label: 'Мембранный бак', dataType: 'measured', unit: 'л' },
    ],
  },
  {
    key: 'piping', label: 'Обвязка и коллектор', dataType: 'group',
    fields: [
      { key: 'collector_code', label: 'Коллектор (шифр D-N-d)', dataType: 'text' },
      {
        key: 'collector_material', label: 'Материал коллектора', dataType: 'enum',
        options: [
          { value: 'ст20', label: 'Углеродистая сталь Ст.20' },
          { value: 'aisi304', label: 'Нержавейка AISI 304 (подземное)' },
        ],
      },
      { key: 'check_valve', label: 'Обратный клапан (на каждый насос)', dataType: 'text' },
      { key: 'disc_valve', label: 'Дисковый затвор (на каждый насос)', dataType: 'text' },
    ],
  },
  {
    key: 'automation', label: 'Автоматика', dataType: 'group',
    fields: [
      { key: 'control_cabinet', label: 'Шкаф управления (серия)', dataType: 'text', hint: 'G-Fire: ШУФ (прямой) / ШУФС (плавный)' },
      { key: 'cabinet_power', label: 'Номинал ШУ (по мощности)', dataType: 'measured', unit: 'кВт' },
      { key: 'cabinet_options', label: 'Опции ШУ', dataType: 'text', hint: 'АВР, УХЛ1, Пз, SF/PTC, 05 (без ШУ)…' },
    ],
  },
  {
    key: 'instrumentation', label: 'КИП', dataType: 'group',
    fields: [
      { key: 'pressure_relay', label: 'Реле давления', dataType: 'text' },
      { key: 'flow_relay', label: 'Реле потока / сухого хода', dataType: 'text' },
      { key: 'manometer', label: 'Манометры', dataType: 'text' },
      { key: 'level_sensor', label: 'Датчики уровня (подземное)', dataType: 'text' },
    ],
  },
  {
    key: 'housing', label: 'Корпус и запас воды', dataType: 'group',
    fields: [
      {
        key: 'housing_type', label: 'Исполнение корпуса', dataType: 'enum',
        options: [
          { value: 'павильон', label: 'Технологический павильон' },
          { value: 'блок-контейнер', label: 'Блок-контейнер' },
          { value: 'подземная-стеклопластик', label: 'Подземная (стеклопластик)' },
          { value: 'на-раме', label: 'Моноблок на раме' },
          { value: 'береговой-модуль', label: 'Береговой модуль' },
        ],
      },
      { key: 'housing_dimensions', label: 'Габариты', dataType: 'text' },
      { key: 'reservoirs_count', label: 'Резервуары пож. запаса, шт', dataType: 'number' },
      { key: 'reservoirs_volume', label: 'Объём резервуаров', dataType: 'measured', unit: 'м³' },
    ],
  },
  {
    key: 'extra', label: 'Доп. оборудование', dataType: 'group',
    fields: [
      { key: 'drainage_pump', label: 'Дренажный насос (подземное)', dataType: 'text' },
      { key: 'compressor', label: 'Компрессор (воздушная АУПТ)', dataType: 'text' },
      { key: 'vacuum_pump', label: 'Вакуумный насос (береговая ПНС)', dataType: 'text' },
      { key: 'extra_items', label: 'Прочее', dataType: 'textarea', hint: 'Донный клапан, заборный рукав и т.п.' },
    ],
  },
];
