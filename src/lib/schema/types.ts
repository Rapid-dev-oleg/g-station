/**
 * Field-spec типа расчёта («опросный лист как данные»).
 *
 * Конструктор схем ведёт список полей (Field[]) для типа станции; из него
 * рисуется динамическая форма ревью (Гейт 1) и формируется опросный лист для
 * LLM-агента. Хранится в TypeSchema.fields (JSON). Ядро расшивания монолитной
 * схемы дела: input становится гибким мешком, форму/промпт задаёт этот spec.
 */

/** Тип данных поля — определяет виджет в динамической форме. */
export type FieldDataType =
  | 'measured' // число + единица + провенанс (extracted/derived/assumed) — Q, H, мощность
  | 'number' // простое число без единицы/провенанса
  | 'enum' // выбор из options — назначение, схема резервирования
  | 'boolean' // да/нет — жокей-насос
  | 'text' // однострочный текст
  | 'textarea' // многострочный текст / примечание
  | 'group' // вложенный объект (fields) — напр. fire_params
  | 'array'; // повторяемый подсписок (fields) — напр. reservoirs

/** Вариант для enum-поля. */
export interface FieldOption {
  value: string;
  label: string;
}

/** Условие видимости поля (простое равенство по другому полю того же уровня). */
export interface VisibleIf {
  field: string;
  /** Поле видно, когда значение `field` равно одному из этих (или true для boolean). */
  equals: (string | number | boolean)[];
}

/** Определение одного поля опросного листа. */
export interface FieldSpec {
  /** Ключ в dossier.stations[].input (стабильный идентификатор). */
  key: string;
  /** Подпись в форме. */
  label: string;
  dataType: FieldDataType;
  /** Единица измерения (для measured): «л/с», «м», «кВт». */
  unit?: string;
  /** Варианты (для enum). */
  options?: FieldOption[];
  /** Обязательное поле карточки для этого типа. */
  required?: boolean;
  /** Значение по умолчанию. */
  default?: unknown;
  /** Подсказка под полем. */
  hint?: string;
  /** Условная видимость (напр. jockey_Q виден при jockey_required=true). */
  visibleIf?: VisibleIf;
  /** Отслеживать провенанс (источник: из документа / выведено / допущение). */
  provenance?: boolean;
  /** Вложенные поля (для group/array). */
  fields?: FieldSpec[];
}

/** Схема ввода типа целиком (то, что лежит в TypeSchema.fields). */
export type TypeFieldSpec = FieldSpec[];
