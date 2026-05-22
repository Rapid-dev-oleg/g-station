/**
 * Zod-схемы позиций каталога — валидация при импорте прайсов (Фаза 3).
 */
import { z } from 'zod';

export const currencySchema = z.enum(['USD', 'CNY', 'RUB']);

export const catalogPumpSchema = z.object({
  sku: z.string().min(1),
  brand: z.string().min(1),
  series: z.string().min(1),
  model: z.string().min(1),
  priceUsd: z.number().positive().optional(),
  priceRub: z.number().positive().optional(),
  currency: currencySchema,
  powerKw: z.number().positive().optional(),
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.string().min(1),
});

export const catalogCollectorSchema = z.object({
  sku: z.string().min(1),
  code: z.string().min(1),
  material: z.string().min(1),
  priceRub: z.number().positive(),
  estimate: z.boolean(),
  source: z.string().min(1),
});

const simpleItemShape = {
  sku: z.string().min(1),
  name: z.string().min(1),
  priceRub: z.number().positive(),
  estimate: z.boolean(),
  source: z.string().min(1),
};

export const catalogPanelSchema = z.object(simpleItemShape);
export const catalogAccessorySchema = z.object(simpleItemShape);
export const catalogWorkSchema = z.object(simpleItemShape);

export const priceMetaSchema = z.object({
  source: z.string().min(1),
  file: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rowCount: z.number().int().nonnegative(),
  currency: z.string().min(1),
});

export const catalogSchema = z.object({
  pumps: z.array(catalogPumpSchema),
  collectors: z.array(catalogCollectorSchema),
  panels: z.array(catalogPanelSchema),
  accessories: z.array(catalogAccessorySchema),
  works: z.array(catalogWorkSchema),
  meta: z.array(priceMetaSchema),
});
