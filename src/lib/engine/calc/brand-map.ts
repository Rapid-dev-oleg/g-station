/**
 * Карта аналогов брендов — правило 3.10 (KB §3.10).
 *
 * Когда ТЗ называет иностранный референс — берётся CNP-аналог того же
 * класса без перерасчёта. Применяется ДО матрицы 3.9-A: если бренд
 * опознан, его класс переопределяет матрицу (часть «физики ТЗ»).
 *
 * Источник входа:
 * - `analog_reference.name` (полное имя референса, например «Wilo MVL 32-410»),
 * - элементы `pump_type_required[]` (свободные строки).
 */

import type { BrandMapEntry, BrandMapRule, Rules } from '../rules';

export interface BrandMapHit {
  entry: BrandMapEntry;
  /** Какая именно подстрока сматчилась — для note. */
  matchedToken: string;
  /** В какой исходной строке нашли. */
  source: string;
}

/**
 * Ищет первый match по карте 3.10. Регистронезависимо, по подстроке.
 * Возвращает null если ни один entry не сработал или нет входа.
 */
export function evalBrandMap(args: {
  analogReferenceName?: string;
  pumpTypeRequired?: string[];
}, rules?: Rules): BrandMapHit | null {
  const rule = rules?.brandMap ?? DEFAULT_BRAND_MAP_RULE;
  const haystacks: string[] = [];
  if (args.analogReferenceName) haystacks.push(args.analogReferenceName);
  if (args.pumpTypeRequired) haystacks.push(...args.pumpTypeRequired);
  if (haystacks.length === 0) return null;

  for (const entry of rule.entries) {
    for (const token of entry.matches) {
      const t = token.toLowerCase();
      for (const h of haystacks) {
        if (h.toLowerCase().includes(t)) {
          return { entry, matchedToken: token, source: h };
        }
      }
    }
  }
  return null;
}

/**
 * Встроенный fallback правила 3.10 — идентичен сидингу в БД.
 * Подстроки подобраны достаточно специфичными, чтобы не давать ложных
 * срабатываний на коротких токенах (например, «CR» — только с пробелом
 * после или с брендом).
 */
export const DEFAULT_BRAND_MAP_RULE: BrandMapRule = {
  ruleId: '3.10-brand-map',
  version: 'fallback',
  entries: [
    // 1. Вертикальный многоступенчатый → CNP CDM / CDMF.
    {
      id: 'multistage-vertical',
      matches: ['MVL', 'MVI', 'MVC', 'Grundfos CR', ' CR ', 'CR-', 'Wellmix CV', 'CV-', 'ANTARUS MLV'],
      classCode: 'MULTISTAGE',
      cnpSeries: 'CNP CDM / CDMF',
      construction: 'вертикальный многоступенчатый (аналог 3.10)',
    },
    // 2. SPLIT_CASE → CNP SMM (раньше END_SUCTION-секции, чтобы LS-HSC и SCP
    //    не перехватились более общими END_SUCTION матчами).
    {
      id: 'split-case',
      matches: ['Wilo SCP', ' SCP ', 'SCP-', 'LS-HSC', 'Grundfos LS', 'СПЛИТ', 'SPLIT'],
      classCode: 'SPLIT_CASE',
      cnpSeries: 'CNP SMM',
      construction: 'двусторонний всас (сплит-кейс, аналог 3.10)',
    },
    // 3. Ин-лайн одноступенчатый → CNP TD.
    {
      id: 'in-line',
      matches: ['Wilo IL', 'Wilo IPN', 'Grundfos TP', ' TP ', 'TP-', 'IN-LINE', 'ин-лайн'],
      classCode: 'IN_LINE',
      cnpSeries: 'CNP TD',
      construction: 'вертикальный ин-лайн одноступенчатый (аналог 3.10)',
    },
    // 4. End-suction горизонтальный одноступенчатый → CNP NIS / NES.
    {
      id: 'end-suction',
      matches: [
        'Wilo NL', 'Wilo BL', ' BL ', 'BL-',
        'Grundfos NK', ' NK ', 'NK-',
        'Masdaf NM', ' NM ', 'NM-',
        'aikon NES', 'NES65', 'NES80', 'NES100',
        'Wellmix NBW', 'NBW', 'NKW',
      ],
      classCode: 'END_SUCTION',
      cnpSeries: 'CNP NIS / NES',
      construction: 'консольный одноступенчатый end-suction (аналог 3.10)',
    },
    // 5. Горизонтальный многоступенчатый (LEO ECH) → Wellmix CUC / CNP CHL.
    //    Класс мапим на MULTISTAGE (физически — многоступенчатый).
    {
      id: 'multistage-horizontal',
      matches: ['LEO ECH', ' ECH ', 'ECH-', 'Wellmix CUC', ' CUC ', 'CNP CHL', ' CHL '],
      classCode: 'MULTISTAGE',
      cnpSeries: 'Wellmix CUC / CNP CHL',
      construction: 'горизонтальный многоступенчатый (аналог 3.10)',
    },
  ],
};
