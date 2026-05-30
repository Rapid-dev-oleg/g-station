/**
 * Параметры ценообразования и подбора — из БД (RuleConfig).
 *
 * Чтобы НЕ хардкодить в коде: наценку клиенту, курс валют, приоритет брендов
 * для веб-поиска. Менеджер правит через UI Settings, без пересборки.
 *
 * Источник: RuleConfig ruleId='pricing-settings' active=true.
 * Если записи нет — отдаются дефолты (см. DEFAULT).
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

  const row = await db.ruleConfig.findFirst({
    where: { ruleId: 'pricing-settings', active: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  const payload = (row?.payload ?? null) as Partial<PricingSettings> | null;
  const merged: PricingSettings = {
    clientMarkup: payload?.clientMarkup ?? DEFAULT.clientMarkup,
    usdRub: payload?.usdRub ?? DEFAULT.usdRub,
    eurRub: payload?.eurRub ?? DEFAULT.eurRub,
    brandPriority: payload?.brandPriority ?? DEFAULT.brandPriority,
    brandSites: payload?.brandSites ?? DEFAULT.brandSites,
  };
  cached = { value: merged, at: now };
  return merged;
}

export function resetPricingSettingsCache(): void {
  cached = null;
}
