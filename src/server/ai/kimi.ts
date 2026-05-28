/**
 * Клиент Kimi (Moonshot) через OpenAI-совместимый SDK.
 *
 * Endpoint Kimi for Coding (`api.kimi.com/coding/v1`) принимает запросы
 * только от coding-агентов — поэтому передаём `User-Agent: claude-code`.
 * Модель `kimi-for-coding` (= Kimi K2.6): vision + 256K контекст.
 *
 * thinking отключаем явно — иначе модель тратит весь бюджет токенов
 * на reasoning_content и возвращает пустой content.
 */

import OpenAI from 'openai';

const KIMI_BASE_URL = 'https://api.kimi.com/coding/v1';
const KIMI_MODEL = 'kimi-for-coding';
const KIMI_USER_AGENT = 'claude-code/1.0';

/** Картинка для vision-запроса. */
export interface KimiImage {
  /** MIME, напр. 'image/png'. */
  mediaType: string;
  /** Содержимое в base64 (без префикса data:). */
  base64: string;
}

function kimiClient(): OpenAI {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY не задан в окружении');
  }
  return new OpenAI({
    apiKey,
    baseURL: KIMI_BASE_URL,
    defaultHeaders: { 'User-Agent': KIMI_USER_AGENT },
  });
}

/** Доступен ли Kimi (есть ключ). */
export function kimiAvailable(): boolean {
  return Boolean(process.env.MOONSHOT_API_KEY);
}

/**
 * Запрос к Kimi. Если переданы `images` — мультимодальный (vision),
 * иначе обычный текстовый. Возвращает текст ответа (ожидается JSON —
 * парсит вызывающий код).
 */
export async function askKimi(params: {
  system: string;
  prompt: string;
  images?: KimiImage[];
  maxTokens?: number;
}): Promise<{ content: string }> {
  const client = kimiClient();

  const userContent =
    params.images && params.images.length > 0
      ? [
          { type: 'text' as const, text: params.prompt },
          ...params.images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
          })),
        ]
      : params.prompt;

  // Тело запроса собираем как нетипизированный объект: поле `thinking` —
  // Kimi-специфичное расширение, его нет в типах OpenAI SDK.
  const body = {
    model: KIMI_MODEL,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: params.maxTokens ?? 4000,
    thinking: { type: 'disabled' },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.chat.completions.create(body as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { content: (res as any).choices?.[0]?.message?.content ?? '' };
}
