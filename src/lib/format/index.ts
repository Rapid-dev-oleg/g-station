/** Форматирование сумм, дат, чисел в русской локали. */

const NBSP = ' ';

export function formatRub(value: number, opts: { withSign?: boolean; decimals?: number } = {}): string {
  const { withSign = true, decimals = 2 } = opts;
  const rounded = Math.round(value * 100) / 100;
  const parts = rounded.toFixed(decimals).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const frac = parts[1];
  const num = decimals > 0 ? `${int},${frac}` : int;
  return withSign ? `${num}${NBSP}₽` : num;
}

export function formatRubShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}млн${NBSP}₽`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}${NBSP}тыс.${NBSP}₽`;
  return formatRub(value);
}

export function formatNumber(value: number, decimals = 0): string {
  const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  const parts = rounded.toFixed(decimals).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return decimals > 0 ? `${int},${parts[1]}` : int;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
  return formatDate(iso);
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Черновик', variant: 'default' },
  in_progress: { label: 'В работе', variant: 'info' },
  ready: { label: 'Готов', variant: 'warning' },
  sent: { label: 'Отправлен', variant: 'success' },
  won: { label: 'Выигран', variant: 'success' },
  lost: { label: 'Проигран', variant: 'danger' },
  calculated: { label: 'Рассчитан', variant: 'info' },
  in_proposal: { label: 'В ТКП', variant: 'success' },
};

export function projectStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? { label: status, variant: 'default' as const };
}

export function systemStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? { label: status, variant: 'default' as const };
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  KNS: 'КНС',
  FIRE: 'Пожаротушение',
  VNS: 'ВНС',
};

export function systemTypeLabel(type: string): string {
  return SYSTEM_TYPE_LABELS[type] ?? type;
}

const TAG_LABELS: Record<string, string> = {
  'промышленное': 'Промышленное',
  'жилищное': 'Жилищное',
  'муниципальное': 'Муниципальное',
  'коммерческое': 'Коммерческое',
  'лид': 'Лид',
};

export function clientTagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}
