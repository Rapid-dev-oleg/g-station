/**
 * Подписи статусов и перечислений доменной модели g-station.
 */

import type { BadgeVariant } from '@/components/ui';

/** Статус проекта (Prisma ProjectStatus). */
export const PROJECT_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Черновик', variant: 'default' },
  IN_PROGRESS: { label: 'В работе', variant: 'info' },
  READY: { label: 'Готов', variant: 'warning' },
  SENT: { label: 'Отправлен', variant: 'success' },
  WON: { label: 'Выигран', variant: 'success' },
  LOST: { label: 'Проигран', variant: 'danger' },
};

export function projectStatusLabel(status: string) {
  return PROJECT_STATUS[status] ?? { label: status, variant: 'default' as BadgeVariant };
}

/** Статус системы (Prisma SystemStatus). */
export const SYSTEM_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  INPUT: { label: 'Ввод данных', variant: 'default' },
  CALCULATED: { label: 'Рассчитана', variant: 'info' },
  REVIEWED: { label: 'Проверена', variant: 'warning' },
  FINALIZED: { label: 'Финал', variant: 'success' },
};

export function systemStatusLabel(status: string) {
  return SYSTEM_STATUS[status] ?? { label: status, variant: 'default' as BadgeVariant };
}

/** Провенанс измеримой величины. */
export const SOURCE_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  extracted: { label: 'извлечено', variant: 'info' },
  derived: { label: 'выведено', variant: 'info' },
  assumed: { label: 'допущение', variant: 'warning' },
  operator: { label: 'оператор', variant: 'success' },
  calculated: { label: 'расчёт', variant: 'brand' },
  default: { label: 'по умолчанию', variant: 'default' },
};

export function sourceLabel(source?: string) {
  return SOURCE_LABEL[source ?? 'operator'] ?? SOURCE_LABEL.operator;
}

export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS).map(
  ([value, { label }]) => ({ value, label }),
);
