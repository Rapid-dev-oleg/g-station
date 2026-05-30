/**
 * MCP-сервер к БД g-station — даёт Kimi-агенту ТОЧНЫЙ доступ к каталогу/прайсу,
 * чтобы он не гадал вебом то, что у нас уже есть в базе.
 *
 * Запускается как stdio-subprocess Kimi CLI (см. kimi-agent.ts, --mcp-config).
 * ВАЖНО: stdout занят MCP-протоколом — любые логи только в stderr.
 *
 * Файл — CJS (package type=commonjs): наши модули импортируются статически,
 * а ESM-only MCP SDK грузится динамическим import() внутри async-IIFE.
 *
 * Инструменты:
 *   • find_collector       — коллектор по DN/числу насосов/материалу (БД)
 *   • find_jockey_piping   — обвязка жокея по макс. давлению (БД)
 *   • find_pump_by_sku     — насос по артикулу/SKU с ценой прайса (БД)
 *   • search_catalog       — поиск по каталогу: категория + текст (БД)
 */

import { z } from 'zod';
import { db } from '@/server/db';
import {
  findCollectorInDb,
  findJockeyPipingInDb,
  findPumpInDbBySku,
} from '@/server/pricing/equipment';
import { findCollectorPrice } from '@/lib/pricing/collectors';

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

(async () => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const server = new McpServer({ name: 'gstation-db', version: '1.0.0' });

  server.registerTool(
    'find_collector',
    {
      description:
        'Найти коллектор насосной станции в каталоге БД по диаметрам и числу насосов. ' +
        'Возвращает SKU, наименование, цену в рублях. Нет в БД — fallback на прайс KNOWLEDGE.',
      inputSchema: {
        dn_suction: z.number().describe('DN всасывающего коллектора, мм'),
        dn_discharge: z.number().optional().describe('DN напорного коллектора, мм'),
        n_pumps: z.number().describe('число насосов'),
        dn_nozzle: z.number().optional().describe('DN патрубка, мм'),
        material: z.string().optional().describe('углеродистая-сталь | нержавеющая-сталь'),
      },
    },
    async (a) => {
      const dbHit = await findCollectorInDb({
        dnSuction: a.dn_suction,
        dnDischarge: a.dn_discharge,
        nPumps: a.n_pumps,
        dnNozzle: a.dn_nozzle,
        material: a.material,
      });
      if (dbHit?.priceRub != null) return json({ source: 'db', ...dbHit });
      const code = `${a.dn_suction}${a.dn_discharge ? `/${a.dn_discharge}` : ''}-${a.n_pumps}${a.dn_nozzle ? `-${a.dn_nozzle}` : ''}`;
      const md = findCollectorPrice(code, a.material);
      return json(
        md
          ? { source: md.exact ? 'md' : 'md-ориентир', code, priceRub: md.priceRub, note: md.source }
          : { found: false, code },
      );
    },
  );

  server.registerTool(
    'find_jockey_piping',
    {
      description: 'Найти обвязку жокей-насоса в каталоге БД по макс. давлению (МПа). Цена в рублях.',
      inputSchema: { pressure_max_mpa: z.number().optional().describe('макс. давление, МПа (по умолчанию 1.0)') },
    },
    async (a) => json((await findJockeyPipingInDb(a.pressure_max_mpa)) ?? { found: false }),
  );

  server.registerTool(
    'find_pump_by_sku',
    {
      description: 'Найти насос в каталоге БД по артикулу/SKU (прайс CNP). Цена прайса в рублях.',
      inputSchema: { sku: z.string().describe('артикул/модель, напр. NES80-65-160-11/2SWH') },
    },
    async (a) => json((await findPumpInDbBySku(a.sku)) ?? { found: false, sku: a.sku }),
  );

  server.registerTool(
    'search_catalog',
    {
      description:
        'Поиск по каталогу БД g-station (категории: pumps, collectors, panels=ШУ, tanks…). ' +
        'Возвращает sku, name, price, currency, attributes. Используй ПЕРЕД веб-поиском.',
      inputSchema: {
        category: z.string().optional().describe('код категории: pumps | collectors | panels | tanks …'),
        query: z.string().optional().describe('подстрока в названии/SKU'),
        limit: z.number().optional().describe('сколько вернуть (по умолчанию 10, макс 50)'),
      },
    },
    async (a) => {
      const rows = await db.catalogItem.findMany({
        where: {
          active: true,
          ...(a.category ? { categoryCode: a.category } : {}),
          ...(a.query
            ? {
                OR: [
                  { name: { contains: a.query, mode: 'insensitive' as const } },
                  { sku: { contains: a.query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: { sku: true, name: true, price: true, currency: true, attributes: true, categoryCode: true },
        take: Math.min(a.limit ?? 10, 50),
      });
      return json({ count: rows.length, items: rows });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[gstation-db MCP] готов\n');
})().catch((e) => {
  process.stderr.write(`[gstation-db MCP] ошибка: ${e?.message ?? e}\n`);
  process.exit(1);
});
