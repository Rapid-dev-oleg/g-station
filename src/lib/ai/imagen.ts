/**
 * Заглушка генерации гидравлической схемы.
 * В прототипе использовался AI-генератор изображений; на этом этапе —
 * простой плейсхолдер-SVG. Реальная схема придёт из module.documentSpec()
 * на фазе 5.
 */
export function inlineSchemaSvg(_system?: unknown): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#f4f6f8" stroke="#d0d7de"/>
  <text x="160" y="92" font-family="sans-serif" font-size="13" fill="#8a93a0"
    text-anchor="middle">Гидравлическая схема — формируется на этапе ТП</text>
</svg>`;
}
