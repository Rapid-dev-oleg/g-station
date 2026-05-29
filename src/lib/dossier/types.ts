/**
 * TS-зеркало JSON Schema «расчётного дела» (src/lib/dossier/schema.json).
 * Единственный источник истины по модели данных приложения.
 *
 * Иерархия: Dossier → meta + stations[] → { input, calc, variants[], output }.
 * Каждый вариант: { equipment, pricing }. Документ растёт по шагам конвейера.
 */

// ─── Провенанс ───────────────────────────────────────────────────────────

/** Источник значения — показывает инженеру, что проверять. */
export type MeasuredSource =
  | 'extracted'   // извлечено из документа напрямую
  | 'derived'     // выведено из косвенных данных
  | 'assumed'     // допущение при отсутствии/недостоверности данных
  | 'operator'    // введено/исправлено инженером
  | 'calculated'  // результат расчёта (шаги 2+)
  | 'default';    // значение по умолчанию

/** Измеримая величина с провенансом. */
export interface Measured {
  value: number | null;
  unit?: string;
  source?: MeasuredSource;
  note?: string;
}

// ─── Перечисления ────────────────────────────────────────────────────────

export type StationType = 'fire' | 'water' | 'power';

export type Scenario =
  | 'подбор-с-нуля'
  | 'проверка-чужого-подбора'
  | 'подбор-на-аналог'
  | 'замена-конкурента'
  | 'торги-аукцион'
  | 'переторжка'
  | 'два-исполнения'
  | 'пересчёт-под-новый-СП';

export type FirePurpose =
  | 'наружное-ПТ'
  | 'ВПВ'
  | 'АУПТ'
  | 'пожаротушение-общее'
  | 'хоз-питьевое'
  | 'повышение-давления'
  | 'береговая-ПНС';

export type ReservationScheme = '1/0' | '1/1' | '2/1' | '2/2' | '3/1';

export type StartType = 'прямой' | 'плавный' | 'частотный' | 'каскадный';

export type CollectorMaterial = 'углеродистая-сталь' | 'нержавеющая-сталь';

export type StationEnclosure =
  | 'моноблок-на-раме'
  | 'технологический-павильон'
  | 'блок-бокс'
  | 'подземное-стеклопластик'
  | 'стеклопластиковый-колодец'
  | 'в-чужом-резервуаре'
  | 'береговой-модуль';

export type PositionGroup =
  | 'насосное'
  | 'гидравлика'
  | 'работа'
  | 'автоматика'
  | 'корпус'
  | 'резервуары'
  | 'кабель'
  | 'прочее';

export type Currency = 'USD' | 'CNY' | 'RUB';

export type ValidationFlag =
  | 'ШУ-цена-0'
  | 'позиция-выпала-из-ИТОГО'
  | 'расхождение-смета-ТП'
  | 'курс-REF'
  | 'опечатка-шифра'
  | 'наценка-не-проставлена';

// ─── Шаг 0 — мета ────────────────────────────────────────────────────────

export interface Meta {
  case_id: string;
  object_name?: string;
  customer?: string;
  engineer?: string;
  scenario: Scenario;
  input_format?: string[];
  output_format?: 'ТП+смета' | 'ТКП-без-технички' | 'только-смета' | 'ТП+смета+чертёж-DWG';
  variants_requested?: string[];
  budget_cap?: { sale?: number; limit?: number };
  deadline?: string;
  analog_reference?: {
    name?: string;
    competitor_price?: number;
    Q?: Measured;
    H?: Measured;
  };
}

// ─── Шаг 1 — входные параметры ───────────────────────────────────────────

export interface Reservoirs {
  required?: boolean;
  count?: number;
  volume?: Measured;
  material?: 'сборный-металл' | 'стеклопластик' | 'бетонный-чужой';
  volume_given?: boolean;
}

export interface FireParams {
  fire_duration?: Measured;
  fire_flow_rate?: Measured;
  streams_count?: number;
  stream_flow?: Measured;
  replenishment_time?: Measured;
}

export interface PowerSupply {
  category?: 'I' | 'II' | 'III';
  inputs?: number;
  avr?: boolean;
  voltage?: string;
  from_generator?: boolean;
  start_current_limit?: string;
}

export interface StationInput {
  station_type: StationType;
  purpose: FirePurpose;
  Q: Measured;
  H: Measured;
  system_pressure?: Measured;
  inlet_pressure?: Measured;
  /** Схема резервирования. Опциональна на входе — определяется расчётом
   *  (методика: дефолт 1/1, 2/1 по правилу 1.3). */
  reservation_scheme?: ReservationScheme;
  working_pumps?: number;
  reserve_pumps?: number;
  jockey_required?: boolean;
  jockey_Q?: Measured;
  jockey_H?: Measured;
  start_type?: StartType;
  collector_material?: CollectorMaterial;
  station_enclosure?: StationEnclosure;
  installation_place?: 'в-помещении' | 'под-заливом' | 'заглублённая' | 'на-берегу';
  pump_type_required?: string[];
  reservoirs?: Reservoirs;
  fire_params?: FireParams;
  power_supply?: PowerSupply;
  limits?: {
    motor_power?: Measured;
    dimensions?: string;
    weight?: Measured;
    noise?: Measured;
  };
  dispatch_requirements?: string[];
  climate_execution?: 'стандарт' | 'У-1' | 'УХЛ1' | 'УХЛ4';
  ip_rating?: 'IP54' | 'IP55' | 'IP65';
  manufacturer_preference?: string[];
  pumping_medium?: { medium?: string; temperature?: Measured; density?: Measured };
  assumptions?: string[];
  special_requirements?: string[];
}

// ─── Шаг 2 — расчётные характеристики ────────────────────────────────────

export interface StationCalc {
  Q_target?: Measured;
  H_target?: Measured;
  working_point?: { Q?: Measured; H?: Measured; reserve_margin?: Measured };
  fire_reserve_volume?: Measured;
  reservoir_volume_rounded?: Measured;
  collector_D_suction?: Measured;
  collector_D_discharge?: Measured;
  jockey_Q_calc?: Measured;
  jockey_H_calc?: Measured;
  applicable_norms?: string[];
}

// ─── Шаг 3 — оборудование ────────────────────────────────────────────────

export interface Equipment {
  main_pump?: {
    brand?: string;
    model?: string;
    qty?: number;
    motor_power?: Measured;
    energy_class?: 'IE2' | 'IE3';
    construction?: string;
    /** Класс конструкции (правило 3.9-A v2 / 3.10): SPLIT_CASE / END_SUCTION / MULTISTAGE / IN_LINE. */
    class_code?: 'SPLIT_CASE' | 'END_SUCTION' | 'MULTISTAGE' | 'IN_LINE';
    /** CNP-серия-ориентир (например «CNP NIS / NES»). */
    series_hint?: string;
    nozzle_suction?: Measured;
    nozzle_discharge?: Measured;
    in_stock?: string;
  };
  jockey_pump?: { brand?: string; model?: string; motor_power?: Measured };
  drainage_pump?: string;
  vacuum_pump?: string;
  compressor?: string;
  control_cabinet?: {
    brand?: 'Шторм' | 'Омега' | 'Рутек' | 'G-Control' | 'нет';
    series?: string;
    rated_power?: Measured;
    options?: string[];
  };
  collector?: { code?: string; material?: CollectorMaterial; pipe_spec?: string };
  valves?: { check_valve?: string; disc_valve?: string; electric_valve?: string };
  instrumentation?: {
    flow_relay?: string;
    pressure_relay?: string;
    manometer?: string;
    membrane_tank?: string;
    level_sensor?: string;
  };
  housing?: { type?: string; code?: string; dimensions?: string };
  reservoirs?: {
    supplier?: 'ВАРПЛАСТ' | 'АКО' | 'ФЕРТИЛ' | 'Биопроект';
    code?: string;
    count?: number;
    volume?: Measured;
  };
  /** Расширяемый список тип-специфичного оборудования (донный клапан и т.п.). */
  extra?: Array<{ name: string; spec?: string }>;
}

// ─── Шаг 4 — ценообразование ─────────────────────────────────────────────

export interface PricingRow {
  position_name: string;
  position_group?: PositionGroup;
  price: number;
  currency?: Currency;
  qty: number;
  discount?: number;
  purchase_cost?: number;
  price_note?: string;
}

export interface Pricing {
  exchange_rate?: number;
  rate_date?: string;
  rows?: PricingRow[];
  total_cost?: number;
  markup_coefficient?: number;
  client_price?: number;
  final_offer_price?: number;
  retorg?: { discount?: number; cost?: number };
  competitor_price?: number;
}

// ─── Вариант ─────────────────────────────────────────────────────────────

export interface Variant {
  name: string;
  reservation_scheme?: ReservationScheme;
  equipment?: Equipment;
  pricing?: Pricing;
}

// ─── Шаг 5 — выход ───────────────────────────────────────────────────────

export interface Output {
  selected_variant?: number;
  selection_criterion?: 'минимальная-цена' | 'наличие-на-складе' | 'ходовая-серия' | 'укладка-в-бюджет';
  product_code?: string;
  code_segments?: {
    series?: 'GF' | 'GW' | 'GP';
    purpose_letter?: 'П' | 'В';
    scheme?: string;
    regulation?: 'ПП' | 'РПП' | 'РЧП' | 'РК';
    options?: string[];
    collector_code?: string;
  };
  documents?: string[];
  validation_flags?: ValidationFlag[];
}

// ─── Станция и дело ──────────────────────────────────────────────────────

export interface Station {
  input: StationInput;
  calc?: StationCalc;
  variants?: Variant[];
  output?: Output;
}

export interface Dossier {
  meta: Meta;
  stations: Station[];
}
