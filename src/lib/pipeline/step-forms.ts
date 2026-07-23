/**
 * Схемы ВЫВОДА шагов конвейера — каждый шаг показывает РЕДАКТИРУЕМУЮ ФОРМУ
 * (field-spec → DynamicForm), а не сырой текст агента. Инженер правит поля, если
 * агент посчитал/подобрал неверно; правка уходит в следующий шаг как истина.
 *
 * Пилот — fire. Подбор (selection) использует СПЕЦ-схему типа (SystemType.specSchema).
 * Расчёт/Цена/Выход — заготовки ниже. Позже переедут в версию типа (versioning).
 */
import type { FieldSpec } from '@/lib/schema/types';

/** Формы вывода по ключу шага (fire). selection берётся из specSchema типа. */
export const FIRE_STEP_FORMS: Record<string, FieldSpec[]> = {
  calc: [
    { key: 'Q_target', label: 'Рабочая точка — расход Q', dataType: 'measured', unit: 'м³/ч' },
    { key: 'H_target', label: 'Рабочая точка — напор H', dataType: 'measured', unit: 'м' },
    { key: 'reservation_scheme', label: 'Схема резервирования', dataType: 'text', hint: 'напр. 1 раб. / 1 рез.' },
    { key: 'working_pumps', label: 'Рабочих насосов', dataType: 'number' },
    { key: 'reserve_pumps', label: 'Резервных насосов', dataType: 'number' },
    { key: 'collector_dn', label: 'Коллектор всас/напор (DN)', dataType: 'text' },
    { key: 'motor_power', label: 'Мощность двигателя', dataType: 'measured', unit: 'кВт' },
    { key: 'start_type', label: 'Тип пуска', dataType: 'text', hint: 'прямой / плавный / ЧРП' },
    { key: 'jockey', label: 'Жокей-насос', dataType: 'text', hint: 'нужен ли, Q/H' },
    { key: 'water_reserve', label: 'Запас пожарной воды', dataType: 'measured', unit: 'м³' },
    { key: 'rationale', label: 'Обоснование (кратко)', dataType: 'textarea' },
  ],
  pricing: [
    { key: 'cost_total', label: 'Себестоимость', dataType: 'number', unit: '₽' },
    { key: 'markup', label: 'Коэффициент наценки', dataType: 'number', hint: '≈1,7 обычные / 1,43 крупные' },
    { key: 'client_price', label: 'Цена клиенту', dataType: 'number', unit: '₽' },
    {
      key: 'rows', label: 'Позиции сметы', dataType: 'array',
      fields: [
        { key: 'item', label: 'Группа · позиция', dataType: 'text' },
        { key: 'source', label: 'Источник цены', dataType: 'text', hint: 'БД / API / оценка' },
        { key: 'cost', label: 'Закупка, ₽', dataType: 'number' },
      ],
    },
  ],
  output: [
    { key: 'product_code', label: 'Шифр изделия', dataType: 'text' },
    { key: 'selection_criterion', label: 'Критерий выбора варианта', dataType: 'text' },
    { key: 'notes', label: 'Примечания / чек-лист валидации', dataType: 'textarea' },
  ],
};

/** Синхронно: форма вывода шага. selection — переданная specSchema типа; прочее — FIRE_STEP_FORMS. */
export function stepForm(typeCode: string, stepKey: string, specSchema: FieldSpec[] | null): FieldSpec[] | null {
  if (stepKey === 'selection' && Array.isArray(specSchema) && specSchema.length) return specSchema;
  if (typeCode === 'fire') return FIRE_STEP_FORMS[stepKey] ?? null;
  return null;
}

const TYPE_HINT: Record<string, string> = {
  measured: 'объект {"value":<число>,"unit":"<ед.>"}',
  number: 'число',
  boolean: 'true/false',
  enum: 'строка из вариантов',
  text: 'строка',
  textarea: 'строка (можно многострочно)',
  group: 'вложенный объект',
  array: 'массив объектов',
};

/** Человекочитаемое описание полей для промпта (чтобы агент вернул JSON по схеме). */
function describeFields(fields: FieldSpec[], indent = ''): string {
  return fields
    .map((f) => {
      const t = TYPE_HINT[f.dataType] ?? 'строка';
      const head = `${indent}- "${f.key}" (${f.label}) — ${t}${f.unit ? `, ед. ${f.unit}` : ''}`;
      if ((f.dataType === 'group' || f.dataType === 'array') && f.fields?.length) {
        return `${head}:\n${describeFields(f.fields, indent + '    ')}`;
      }
      return head;
    })
    .join('\n');
}

/** Инструкция агенту: после работы вернуть результат шага СТРОГО одним JSON-блоком. */
export function stepJsonInstruction(form: FieldSpec[]): string {
  return (
    '\n\n=== ФОРМАТ ОТВЕТА ===\n' +
    'После работы верни РЕЗУЛЬТАТ шага ОДНИМ JSON-блоком в ```json ... ``` строго по этим полям ' +
    '(без пояснений вне блока; значения — из расчёта/подбора, не выдумывай; пропущенное — null):\n' +
    describeFields(form)
  );
}

/** Достать структуру результата из вывода агента (JSON-блок). */
export function parseStepData(output: string): Record<string, unknown> | null {
  const fence = output.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : output.match(/\{[\s\S]*\}/)?.[0] ?? '';
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
