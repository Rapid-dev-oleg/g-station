/**
 * Общие типы адаптеров импорта прайсов (Фаза 3).
 *
 * Каждый адаптер (CNP CSV, Wellmix PDF, …) разбирает свой формат прайса
 * и возвращает единообразный `ImportResult`: нормализованные строки-позиции
 * каталога + метаданные прайса + список отклонённых строк.
 *
 * Строки-позиции описаны типом `ImportPriceRow` и валидируются zod-схемой
 * `importPriceRowSchema` перед записью в БД.
 */
import { z } from 'zod';

/** Валюта прайса. */
export const importCurrencySchema = z.enum(['USD', 'CNY', 'RUB']);
export type ImportCurrency = z.infer<typeof importCurrencySchema>;

/**
 * Нормализованная строка прайса — насосная позиция каталога.
 * Цена хранится в исходной валюте прайса (поле `currency`).
 */
export const importPriceRowSchema = z.object({
  /** Артикул (уникальный ключ в пределах производителя). */
  sku: z.string().min(1),
  /** Наименование позиции. */
  name: z.string().min(1),
  /** Серия, напр. 'NIS', 'CDM', 'WRS'. */
  series: z.string().min(1),
  /** Цена в исходной валюте прайса. */
  price: z.number().positive(),
  /** Валюта цены. */
  currency: importCurrencySchema,
  /** Мощность двигателя, кВт — если паттерн распознан (не выдумывается). */
  powerKw: z.number().positive().optional(),
});
export type ImportPriceRow = z.infer<typeof importPriceRowSchema>;

/** Метаданные импортируемого прайса. */
export type ImportMeta = {
  /** Имя производителя (должен существовать в БД как Manufacturer). */
  manufacturer: string;
  /** Заголовок прайса, напр. 'CNP прайс 2026-05-21'. */
  title: string;
  /** Имя/путь исходного файла. */
  sourceFile: string;
  /** Валюта прайса. */
  currency: ImportCurrency;
  /** Дата прайса (ISO YYYY-MM-DD). */
  priceDate: string;
};

/** Отклонённая при парсинге строка. */
export type ImportReject = {
  /** Номер строки исходника (если применимо). */
  line: number;
  /** Причина отклонения. */
  reason: string;
  /** Сырой текст строки. */
  raw: string;
};

/** Результат работы адаптера импорта. */
export type ImportResult = {
  rows: ImportPriceRow[];
  meta: ImportMeta;
  rejected: ImportReject[];
};
