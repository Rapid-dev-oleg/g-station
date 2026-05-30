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
 * То же для `input` — но глубже: ИИ часто возвращает `system_pressure: null`,
 * `jockey_Q: null`, `fire_params: { fire_duration: null, ... }` — AJV видит
 * «must be object», потому что Measured ожидается объектом, не null.
 * Рекурсивно убираем null-значения и null-поля внутри вложенных объектов.
 * Поле `value: null` внутри Measured ОСТАВЛЯЕМ — оно разрешено схемой.
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
      // Measured (есть свойство value) — сохраняем как есть, value: null валиден.
      if ('value' in (val as object)) {
        out[key] = val;
      } else {
        out[key] = scrubInput(val as Record<string, unknown>);
      }
      continue;
    }
    out[key] = val;
  }
  return out as T;
}
