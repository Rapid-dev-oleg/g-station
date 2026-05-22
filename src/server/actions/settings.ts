'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { chatCompletion, getAiConfig } from '@/server/ai';

/** Сохранить настройки ИИ: ключ OpenRouter и выбранную модель. */
export async function updateAiSettings(input: {
  openrouterKey: string;
  aiModel: string;
}): Promise<{ ok: boolean }> {
  const data = {
    openrouterKey: input.openrouterKey.trim() || null,
    aiModel: input.aiModel.trim() || null,
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
