import { db } from '@/server/db';
import { chatCompletion, type ChatMessage, type ChatResult } from './openrouter';
import { DEFAULT_AI_MODEL } from './models';

export * from './models';
export { chatCompletion } from './openrouter';
export type { ChatMessage, ChatResult } from './openrouter';

/** Конфигурация ИИ из настроек: ключ OpenRouter и активная модель. */
export async function getAiConfig(): Promise<{ apiKey: string; model: string }> {
  const s = await db.settings.findUnique({ where: { id: 'singleton' } });
  return {
    apiKey: s?.openrouterKey || process.env.OPENROUTER_API_KEY || '',
    model: s?.aiModel || process.env.OPENROUTER_MODEL || DEFAULT_AI_MODEL,
  };
}

/** Запрос к ИИ. Ключ и модель — из настроек (модель можно переопределить). */
export async function askAi(params: {
  system?: string;
  prompt: string;
  model?: string;
  jsonMode?: boolean;
}): Promise<ChatResult> {
  const cfg = await getAiConfig();
  const messages: ChatMessage[] = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  messages.push({ role: 'user', content: params.prompt });
  return chatCompletion({
    messages,
    model: params.model || cfg.model,
    apiKey: cfg.apiKey,
    jsonMode: params.jsonMode,
  });
}
