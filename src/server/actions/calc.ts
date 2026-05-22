'use server';

/**
 * Server actions для расчёта системы.
 *
 * runSystemCalc — прогоняет расчётное дело через движок и пишет результат
 * назад в System.dossier; зеркалирует totalCost/clientPrice для списков.
 */

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { Dossier } from '@/lib/dossier/types';
import { allGates, type GateReport } from '@/lib/engine/gates';
import { db } from '@/server/db';
import { DossierValidationError, runCalculationWithDbCatalog } from '@/server/engine-runner';

/** Достаёт цены выбранного (или первого) варианта первой станции. */
function mirrorPrices(dossier: Dossier): { totalCost: number | null; clientPrice: number | null } {
  const station = dossier.stations[0];
  const variants = station?.variants ?? [];
  const idx = station?.output?.selected_variant ?? 0;
  const variant = variants[idx] ?? variants[0];
  return {
    totalCost: variant?.pricing?.total_cost ?? null,
    clientPrice: variant?.pricing?.client_price ?? null,
  };
}

/**
 * Прогоняет расчёт системы: читает dossier, гоняет конвейер движка,
 * пишет назад dossier + зеркало цен + статус CALCULATED.
 *
 * Каталог подключён (фаза 3): расчёт использует реальные цены из БД-каталога
 * (импортированные прайсы CNP, Wellmix). Позиции вне каталога — оценочные.
 */
export async function runSystemCalc(systemId: string) {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) {
    return { ok: false as const, errors: ['Система не найдена'] };
  }

  const dossier = system.dossier as unknown as Dossier;

  let result: { dossier: Dossier; gates: GateReport[] };
  try {
    result = await runCalculationWithDbCatalog(dossier);
  } catch (e) {
    if (e instanceof DossierValidationError) {
      return { ok: false as const, errors: e.errors, stage: e.stage };
    }
    return {
      ok: false as const,
      errors: [e instanceof Error ? e.message : 'Неизвестная ошибка расчёта'],
    };
  }

  const { totalCost, clientPrice } = mirrorPrices(result.dossier);

  await db.system.update({
    where: { id: systemId },
    data: {
      dossier: result.dossier as unknown as Prisma.InputJsonValue,
      totalCost,
      clientPrice,
      status: 'CALCULATED',
    },
  });

  revalidatePath(`/systems/${systemId}`);
  revalidatePath(`/projects/${system.projectId}`);

  return { ok: true as const, gates: result.gates, totalCost, clientPrice };
}

/** Возвращает отчёты по гейтам для текущего состояния дела системы. */
export async function getSystemGates(systemId: string) {
  const system = await db.system.findUnique({ where: { id: systemId } });
  if (!system) {
    return { ok: false as const, errors: ['Система не найдена'] };
  }
  const dossier = system.dossier as unknown as Dossier;
  return { ok: true as const, gates: allGates(dossier) };
}
