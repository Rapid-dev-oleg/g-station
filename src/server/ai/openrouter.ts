/** Клиент OpenRouter — OpenAI-совместимый chat completions API. */
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model: string;
  apiKey: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Запрос к OpenRouter. Ключ передаётся явно (берётся из настроек). */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  if (!opts.apiKey) {
    throw new Error('Ключ OpenRouter не задан — укажите его в Настройках');
  }

  /** Один запрос к API; useJsonMode управляет полем response_format. */
  async function request(useJsonMode: boolean): Promise<Response> {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'G-Station',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  }

  let res = await request(Boolean(opts.jsonMode));

  // Часть моделей/провайдеров не поддерживает structured-outputs —
  // повторяем запрос без response_format (промпт всё равно требует JSON).
  if (!res.ok && opts.jsonMode) {
    const errText = await res.text();
    if (/structured-outputs|response_format/i.test(errText)) {
      res = await request(false);
    } else {
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  return { content, model: data?.model ?? opts.model, usage: data?.usage };
}
