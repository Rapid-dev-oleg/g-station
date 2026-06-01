/**
 * Регистрация обработчиков фоновых задач. Импортируется из job-actions, чтобы
 * обработчики были зарегистрированы до постановки задач в очередь.
 */

import { registerJobHandler } from './runner';
import { calcSystemViaKimi } from '@/server/actions/kimi-calc';

let registered = false;

export function ensureJobHandlers(): void {
  if (registered) return;
  registered = true;

  // Расчёт станции: тяжёлый Kimi-агент (~5–8 мин). Результат calcSystemViaKimi
  // сохраняет в System.kimiCalc сам — поэтому страница системы увидит его и
  // после ухода/возврата.
  registerJobHandler('calc', async (input, ctx) => {
    const { systemId } = input as { systemId: string };
    await ctx.progress(15, 'Расчёт характеристик и подбор оборудования (Kimi)…');
    const r = await calcSystemViaKimi(systemId, true);
    if (!r.ok) throw new Error(r.error || 'Расчёт не удался');
    return {
      systemId,
      result: { total: r.data?.total, clientPrice: r.data?.clientPrice, code: r.data?.code },
    };
  });
}
