/**
 * Дизайн карточки РЕЗУЛЬТАТА расчёта как ДАННЫЕ (конфиг блоков из каталога).
 *
 * Итоговый экран прогона (RunView) рисуется не захардкоженной вёрсткой, а по
 * `SystemType.cardLayout` — упорядоченному списку блоков из каталога ниже.
 * Приложение рисует блоки (безопасно, без произвольного HTML); ИИ-помощник и
 * редактор меняют список/порядок/видимость/подписи. Данные блок берёт из
 * структурной сводки (`RunSummary`) по фиксированной привязке (`dataKey`).
 */
import type { RunSummary } from '@/server/pipeline/runner';

/** Тип блока — совпадает с секцией каталога; привязка к данным фиксирована. */
export type CardBlockType = 'header' | 'characteristics' | 'equipment' | 'estimate' | 'gates';

/** Один блок в карточке результата. */
export interface CardBlock {
  type: CardBlockType;
  /** Переопределение заголовка секции (иначе — из каталога). */
  title?: string;
  /** Скрыть блок (остаётся в конфиге, но не рисуется). */
  hidden?: boolean;
}

export type CardLayout = CardBlock[];

/** Каталог доступных блоков — что можно поставить в карточку и откуда данные. */
export const CARD_BLOCK_CATALOG: {
  type: CardBlockType;
  label: string;
  dataKey: keyof RunSummary | 'cipher+estimate';
  description: string;
}[] = [
  { type: 'header', label: 'Шапка: шифр + цена', dataKey: 'cipher+estimate', description: 'Шифр изделия и цена клиенту крупно' },
  { type: 'characteristics', label: 'Характеристики', dataKey: 'characteristics', description: 'Плитки Q, H, схема, насос, мощность, пуск' },
  { type: 'equipment', label: 'Состав оборудования', dataKey: 'equipment', description: 'Таблица позиций (наименование / характеристика / кол-во)' },
  { type: 'estimate', label: 'Смета', dataKey: 'estimate', description: 'Таблица закупки + себестоимость и цена клиенту' },
  { type: 'gates', label: 'Требует подтверждения', dataKey: 'gates', description: 'Список пунктов на подтверждение инженера (гейты)' },
];

const CATALOG_LABEL: Record<CardBlockType, string> = Object.fromEntries(
  CARD_BLOCK_CATALOG.map((b) => [b.type, b.label]),
) as Record<CardBlockType, string>;

/** Заголовок блока для рендера (переопределение → каталог). */
export function blockTitle(b: CardBlock): string {
  return b.title?.trim() || CATALOG_LABEL[b.type];
}

/** Дизайн по умолчанию — повторяет исходную вёрстку SummaryView 1:1. */
export const DEFAULT_CARD_LAYOUT: CardLayout = [
  { type: 'header' },
  { type: 'characteristics' },
  { type: 'equipment' },
  { type: 'estimate' },
  { type: 'gates' },
];

const KNOWN = new Set<string>(CARD_BLOCK_CATALOG.map((b) => b.type));

/**
 * Проверка/нормализация конфига. Возвращает валидный CardLayout или строку-ошибку.
 * Правила: массив; известные типы; без дублей (каждый блок привязан к одному
 * куску данных); хотя бы один видимый блок.
 */
export function validateCardLayout(input: unknown): CardLayout | string {
  if (!Array.isArray(input)) return 'дизайн должен быть списком блоков';
  if (input.length === 0) return 'добавьте хотя бы один блок';
  const out: CardLayout = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return 'блок должен быть объектом';
    const type = (raw as CardBlock).type;
    if (!KNOWN.has(type)) return `неизвестный блок «${String(type)}»`;
    if (seen.has(type)) return `блок «${CATALOG_LABEL[type]}» повторяется`;
    seen.add(type);
    const block: CardBlock = { type };
    const title = (raw as CardBlock).title;
    if (typeof title === 'string' && title.trim()) block.title = title.trim();
    if ((raw as CardBlock).hidden === true) block.hidden = true;
    out.push(block);
  }
  if (out.every((b) => b.hidden)) return 'все блоки скрыты — покажите хотя бы один';
  return out;
}

/** Читаемый CardLayout из БД-значения (fallback — дизайн по умолчанию). */
export function coerceCardLayout(value: unknown): CardLayout {
  const v = validateCardLayout(value);
  return typeof v === 'string' ? DEFAULT_CARD_LAYOUT : v;
}

/** Пример сводки — для живого предпросмотра в редакторе дизайна. */
export const SAMPLE_SUMMARY: RunSummary = {
  characteristics: { Q: '50 м³/ч', H: '40 м', scheme: '1 раб. / 1 рез.', pump: 'CDM 65 · 11 кВт', power: '11 кВт', start: 'плавный (УПП)' },
  equipment: [
    { name: 'Насос CDM 65-3', spec: 'Q=50 м³/ч, H=40 м', qty: '2' },
    { name: 'Шкаф управления', spec: 'с УПП, IP54', qty: '1' },
    { name: 'Рама-основание', spec: 'сталь, окраска', qty: '1' },
  ],
  estimate: {
    rows: [
      { item: 'Насосы · CDM 65-3', source: 'БД', cost: 640000 },
      { item: 'Автоматика · шкаф УПП', source: 'БД', cost: 310000 },
      { item: 'Обвязка · трубы/арматура', source: 'оценка', cost: 180000 },
    ],
    cost_total: 1130000,
    client_price: 1985000,
  },
  cipher: 'G-Fire GF-П-1/1-CDM65-3(±)/11-ПП-03-07',
  gates: ['Курс валют на дату КП', 'Наценка проекта (задать %)'],
};
