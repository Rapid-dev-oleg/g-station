/**
 * Валидация «расчётного дела» против JSON Schema (draft 2020-12).
 * Схема проверяет ФОРМУ данных; полноту по шагам/типу проверяет
 * контракт типа в движке (engine), не ajv.
 */
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './schema.json';
import type { Dossier } from './types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateFn = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Проверяет дело против схемы. Возвращает список ошибок в читаемом виде. */
export function validateDossier(dossier: unknown): ValidationResult {
  const valid = validateFn(dossier) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || '(корень)'}: ${e.message ?? 'ошибка'}`
  );
  return { valid: false, errors };
}

/** Бросает исключение, если дело невалидно — для скриптов и тестов. */
export function assertValidDossier(dossier: unknown): asserts dossier is Dossier {
  const { valid, errors } = validateDossier(dossier);
  if (!valid) {
    throw new Error('Расчётное дело не прошло валидацию схемы:\n' + errors.join('\n'));
  }
}
