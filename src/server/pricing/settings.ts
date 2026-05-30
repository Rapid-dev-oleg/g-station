/**
 * Параметры ценообразования и подбора — из таблицы Settings (singleton).
 *
 * Чтобы НЕ хардкодить в коде: наценку клиенту, курс USD, приоритет брендов.
 * Менеджер правит через UI /settings, без пересборки.
 *
 * Использует существующие поля Settings.defaultMarkup / defaultRateUsd.
 * Приоритет брендов / сайты — пока в defaults (можно вынести в Settings позже).
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

  const row = await db.settings.findUnique({ where: { id: 'singleton' } });
  const merged: PricingSettings = {
    clientMarkup: row?.defaultMarkup ?? DEFAULT.clientMarkup,
    usdRub: row?.defaultRateUsd ?? DEFAULT.usdRub,
    eurRub: DEFAULT.eurRub,
    brandPriority: DEFAULT.brandPriority,
    brandSites: DEFAULT.brandSites,
  };
  cached = { value: merged, at: now };
  return merged;
}

export function resetPricingSettingsCache(): void {
  cached = null;
}
