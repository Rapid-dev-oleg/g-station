/**
 * Параметры ценообразования и подбора.
 *
 * Чтобы НЕ хардкодить в коде:
 *  - наценку клиенту и курсы — из таблицы Settings (singleton);
 *  - приоритет брендов и сайты — из RuleConfig (`brand-priority`), тем же
 *    механизмом, что и правила расчёта (3.10/5.1/...). Правится через seed /
 *    Prisma Studio, версионируется, без пересборки.
 *
 * Хардкод-DEFAULT остаётся ТОЛЬКО как страховка на пустую БД (первый запуск
 * до сидинга) — рабочее значение всегда приходит из БД.
 */

import { db } from '@/server/db';

export interface PricingSettings {
  /** Коэффициент наценки клиенту: cost × markup = client price. */
  clientMarkup: number;
  /** Курс USD → RUB (для конверсии цен прайса CNP в БД). */
  usdRub: number;
  /** Курс EUR → RUB. */
  eurRub: number;
  /** Приоритет брендов для веб-поиска оборудования (CNP — по умолчанию №1). */
  brandPriority: string[];
  /** URL официальных сайтов брендов в РФ — приоритет в веб-поиске. */
  brandSites: Record<string, string>;
}

const DEFAULT: PricingSettings = {
  clientMarkup: 1.7,
  usdRub: 92,
  eurRub: 100,
  brandPriority: ['CNP', 'Wilo', 'Grundfos', 'Wellmix'],
  brandSites: {
    CNP: 'https://www.cnprussia.ru',
    Wilo: 'https://wilo.com/ru',
    Grundfos: 'https://grundfos.ru',
    Wellmix: 'https://wellmix.ru',
  },
};

let cached: { value: PricingSettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getPricingSettings(): Promise<PricingSettings> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;

  const [row, brand] = await Promise.all([
    db.settings.findUnique({ where: { id: 'singleton' } }),
    db.ruleConfig.findFirst({
      where: { ruleId: 'brand-priority', active: true },
      orderBy: { effectiveFrom: 'desc' },
    }),
  ]);

  // Бренды/сайты — из RuleConfig (payload), DEFAULT только если записи ещё нет.
  const bp = (brand?.payload ?? null) as { brandPriority?: unknown; brandSites?: unknown } | null;
  const brandPriority = Array.isArray(bp?.brandPriority) && bp!.brandPriority.length
    ? (bp!.brandPriority as string[])
    : DEFAULT.brandPriority;
  const brandSites = bp?.brandSites && typeof bp.brandSites === 'object'
    ? (bp.brandSites as Record<string, string>)
    : DEFAULT.brandSites;

  const merged: PricingSettings = {
    clientMarkup: row?.defaultMarkup ?? DEFAULT.clientMarkup,
    usdRub: row?.defaultRateUsd ?? DEFAULT.usdRub,
    eurRub: DEFAULT.eurRub,
    brandPriority,
    brandSites,
  };
  cached = { value: merged, at: now };
  return merged;
}

export function resetPricingSettingsCache(): void {
  cached = null;
}
