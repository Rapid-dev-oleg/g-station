/**
 * Чтение глобальных настроек для Server Components (без 'use server').
 */

import { db } from '@/server/db';

/** Глобальные настройки (одна запись id='singleton'). null, если не созданы. */
export function getSettings() {
  return db.settings.findUnique({ where: { id: 'singleton' } });
}
