'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { chatCompletion, getAiConfig } from '@/server/ai';
import { resetPricingSettingsCache } from '@/server/pricing/settings';

/** Сохранить параметры ценообразования: курс USD/CNY, коэф. наценки. */
export async function updatePricingSettings(input: {
  defaultRateUsd?: number | null;
  defaultRateCny?: number | null;
  defaultMarkup?: number | null;
}): Promise<{ ok: boolean }> {
  const data = {
    defaultRateUsd: input.defaultRateUsd ?? null,
    defaultRateCny: input.defaultRateCny ?? null,
    defaultMarkup: input.defaultMarkup ?? null,
  };
  await db.settings.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  resetPricingSettingsCache();
  revalidatePath('/settings');
  return { ok: true };
}

/** Сохранить настройки ИИ: ключ OpenRouter, модель, ключ Kimi и движок расчёта. */
export async function updateAiSettings(input: {
  openrouterKey: string;
  aiModel: string;
  kimiKey?: string;
  calcAgent?: string;
}): Promise<{ ok: boolean }> {
  const data = {
    openrouterKey: input.openrouterKey.trim() || null,
    aiModel: input.aiModel.trim() || null,
    kimiKey: input.kimiKey?.trim() || null,
    calcAgent: input.calcAgent === 'claude' ? 'claude' : 'kimi',
  };
  await db.settings.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  revalidatePath('/settings');
  return { ok: true };
}

/** Проверка связи с OpenRouter. Можно передать ещё не сохранённые ключ/модель. */
export async function testAi(override?: {
  apiKey?: string;
  model?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await getAiConfig();
    const apiKey = override?.apiKey?.trim() || cfg.apiKey;
    const model = override?.model?.trim() || cfg.model;
    if (!apiKey) return { ok: false, message: 'Ключ OpenRouter не задан' };
    const r = await chatCompletion({
      messages: [{ role: 'user', content: 'Ответь одним словом: работает' }],
      model,
      apiKey,
    });
    return { ok: true, message: `${r.model}: ${r.content.slice(0, 100)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
