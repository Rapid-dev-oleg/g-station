'use server';

/**
 * Расчёт системы через Kimi-агента по скилу `pump-station-calc`.
 *
 * Агент гоняется долго (~3 мин), поэтому результат кешируется в
 * System.kimiCalc + хеш карточки (kimiCalcHash). Повторный вызов с той же
 * карточкой отдаёт кеш мгновенно; пересчёт — только когда карточка изменилась.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Dossier, StationInput, Meta } from '@/lib/dossier/types';
import { db } from '@/server/db';
import { runKimiAgent } from '@/server/ai/kimi-agent';

/** Скил расчёта по типу системы (сейчас один — пожарные/водоснабжение). */
function skillForType(_typeCode: string): string {
  return 'pump-station-calc';
}

/** Карточка для расчёта: вход станции + назначение из dossier. */
interface CalcCard {
  object_name?: string;
  input: Partial<StationInput>;
}

function buildCard(dossier: Dossier): CalcCard {
  const meta = dossier.meta as Meta | undefined;
  return {
    object_name: meta?.object_name,
    input: dossier.stations?.[0]?.input ?? {},
  };
}

function hashCard(card: CalcCard): string {
  return createHash('sha256').update(JSON.stringify(card)).digest('hex').slice(0, 16);
}

export interface KimiCalcResult {
  ok: boolean;
  /** Текст расчёта от агента (markdown с обоснованием + гейты). */
  output?: string;
  /** Отдан ли кеш (true) или пересчитано заново (false). */
  cached?: boolean;
  error?: string;
}

/**
 * Считает систему через Kimi-агента (с кешем по хешу карточки).
 * @param force пересчитать даже если кеш валиден.
 */
export async function calcSystemViaKimi(
  systemId: string,
  force = false,
): Promise<KimiCalcResult> {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) return { ok: false, error: 'Система не найдена' };

  const dossier = system.dossier as unknown as Dossier;
  const card = buildCard(dossier);
  const hash = hashCard(card);

  // Кеш валиден — отдаём без прогона агента.
  if (!force && system.kimiCalcHash === hash && system.kimiCalc) {
    const cached = system.kimiCalc as { output?: string };
    return { ok: true, output: cached.output ?? '', cached: true };
  }

  try {
    const { output } = await runKimiAgent({
      skill: skillForType(system.typeCode),
      prompt:
        'Посчитай насосную станцию по карточке и верни понятный итог: схема, ' +
        'насос (класс), мотор кВт, коллектор DN, жокей, шкаф управления, шифр — ' +
        'и КОРОТКО обоснуй каждое решение (1 строка). В конце раздел ' +
        '«На проверку инженеру». Карточка:\n' +
        JSON.stringify(card, null, 2),
      timeoutMs: 8 * 60 * 1000,
    });

    await db.system.update({
      where: { id: systemId },
      data: {
        kimiCalc: { output, at: new Date().toISOString() },
        kimiCalcHash: hash,
        status: 'CALCULATED',
      },
    });

    revalidatePath(`/projects/${system.projectId}/systems/${systemId}`);
    return { ok: true, output, cached: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
