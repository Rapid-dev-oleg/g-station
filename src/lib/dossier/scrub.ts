/**
 * Очистка распарсенных ИИ карточек от null'ов, ломающих валидацию схемы.
 *
 * Вынесено из server-action `parse.ts`: файл с `'use server'` может
 * экспортировать только async-функции, а это синхронные чистые хелперы,
 * нужные и парсеру, и оффлайн-скриптам.
 */

import type { Meta } from './types';

/**
 * Чистит `meta` от null'ов в опциональных полях верхнего уровня.
 * ИИ-разбор регулярно возвращает `customer: null` / `object_name: null`
 * для отсутствующих в ТЗ реквизитов — AJV в этом случае ругается
 * «/meta/customer: must be string». Превращаем такие null'ы в отсутствие
 * ключа, чтобы валидация схемы пропускала.
 */
export function scrubMeta<T extends Partial<Meta>>(meta: T): T {
  const out = { ...meta } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === null) delete out[key];
  }
  return out as T;
}

/**
 * Поля input, которые по схеме являются Measured (`{ value, unit, source, note }`).
 * Для них объект-обёртка легитимна (и `value: null` разрешён). Все ОСТАЛЬНЫЕ поля —
 * скаляры (enum/boolean/integer): если ИИ обернул их в `{ value: ... }` (так делает
 * агентный парсер), обёртку надо РАЗВЕРНУТЬ в скаляр, иначе AJV ругается
 * «must be string/boolean». Набор включает и детей fire_params.
 */
const MEASURED_KEYS = new Set([
  'Q',
  'H',
  'system_pressure',
  'inlet_pressure',
  'jockey_Q',
  'jockey_H',
  'fire_duration',
  'fire_flow_rate',
  'stream_flow',
  'replenishment_time',
]);

/**
 * Чистит `input` для валидации схемы:
 *  - убирает null-значения и null-поля (ИИ часто шлёт `jockey_Q: null`);
 *  - Measured-поля (Q, H, jockey_Q/H, дети fire_params) оставляет объектами;
 *  - скалярные поля, ошибочно обёрнутые в `{ value, ... }`, РАЗВОРАЧИВАЕТ в скаляр
 *    (reservation_scheme/jockey_required/collector_material/… от агентного парсера).
 */
export function scrubInput<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null) continue;
    if (Array.isArray(val)) {
      out[key] = val;
      continue;
    }
    if (typeof val === 'object') {
      const wrapped = 'value' in (val as object);
      if (wrapped && MEASURED_KEYS.has(key)) {
        // Measured: оставляем value (null валиден), но чистим null в unit/source/
        // note — схема требует там строку, а ИИ часто шлёт null.
        const m = val as Record<string, unknown>;
        const cleaned: Record<string, unknown> = { value: m.value ?? null };
        for (const p of ['unit', 'source', 'note'] as const) {
          if (m[p] !== null && m[p] !== undefined) cleaned[p] = m[p];
        }
        out[key] = cleaned;
      } else if (wrapped) {
        // Обёртка скаляра {value, unit, source, note} → разворачиваем в значение.
        const inner = (val as { value: unknown }).value;
        if (inner !== null && inner !== undefined) out[key] = inner; // null → поле отсутствует
      } else {
        out[key] = scrubInput(val as Record<string, unknown>); // вложенный объект (fire_params)
      }
      continue;
    }
    out[key] = val;
  }
  return out as T;
}
