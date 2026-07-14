/**
 * Резолвер токенов в инструкциях: {{norm:КОД#якорь}} и {{param:ключ}}.
 *
 * Инструкции ссылаются на нормы/параметры токенами (вставляются пикером).
 * Резолвер (а) извлекает ссылки — для индекса «где используется» и связей,
 * (б) разворачивает текст для предпросмотра/промпта, подставляя код нормы +
 * (опц.) контент якоря и подпись параметра. Правка ГОСТа = правка Norm.content,
 * текст инструкции не трогается.
 */

export interface NormLite {
  code: string;
  version?: string | null;
  title?: string | null;
  content?: Record<string, { label?: string; value?: unknown }> | null;
}

const NORM_RE = /\{\{norm:([^#}]+?)(?:#([^}]+))?\}\}/g;
const PARAM_RE = /\{\{param:([^}]+?)\}\}/g;

export interface Refs {
  norms: { code: string; anchor?: string }[];
  params: string[];
}

/** Извлекает все ссылки на нормы и параметры из текста инструкции. */
export function extractRefs(text: string): Refs {
  const norms: { code: string; anchor?: string }[] = [];
  const params: string[] = [];
  for (const m of text.matchAll(NORM_RE)) norms.push({ code: m[1].trim(), anchor: m[2]?.trim() });
  for (const m of text.matchAll(PARAM_RE)) params.push(m[1].trim());
  return { norms, params };
}

/** Уникальные коды норм, на которые ссылается текст (для связей/индекса). */
export function normCodes(text: string): string[] {
  return [...new Set(extractRefs(text).norms.map((n) => n.code))];
}

/**
 * Разворачивает токены в читаемый текст.
 * {{norm:КОД#якорь}} → «КОД · <подпись якоря>»; неизвестная норма → «⚠ КОД».
 * {{param:ключ}} → подпись параметра (или ключ).
 */
export function resolveText(
  text: string,
  norms: Map<string, NormLite>,
  paramLabels: Map<string, string> = new Map(),
): string {
  return text
    .replace(NORM_RE, (_all, code: string, anchor?: string) => {
      const n = norms.get(code.trim());
      if (!n) return `⚠ ${code.trim()}`;
      const anchorLabel = anchor && n.content?.[anchor.trim()]?.label;
      return anchorLabel ? `${n.code} · ${anchorLabel}` : anchor ? `${n.code} · ${anchor.trim()}` : n.code;
    })
    .replace(PARAM_RE, (_all, key: string) => paramLabels.get(key.trim()) ?? key.trim());
}
