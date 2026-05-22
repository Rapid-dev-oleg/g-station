/** Пресеты моделей OpenRouter для выбора в интерфейсе. */
export interface AiModel {
  id: string;
  label: string;
  note?: string;
}

export const AI_MODELS: AiModel[] = [
  { id: 'moonshotai/kimi-k2', label: 'Kimi K2 (Moonshot)', note: 'длинный контекст, недорого' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', note: 'качество извлечения' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
];

/** Модель по умолчанию, если в настройках не выбрана. */
export const DEFAULT_AI_MODEL = 'moonshotai/kimi-k2';
