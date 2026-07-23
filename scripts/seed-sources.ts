/**
 * Засев реестра источников подбора (Source). Идемпотентно: если источник с таким
 * именем уже есть — не трогаем (правки/токен целы). Запуск: npx tsx scripts/seed-sources.ts
 *
 * Wellmix — источник типа api (живой подбор насосов по Q/H через MCP select_pump).
 * ⚠ Токен из документации — ПРИМЕР (API отвечает «Пользователь не существует»);
 * реальный токен клиента вставляется в реестре «Источники» (/admin/sources).
 */
import { db } from '@/server/db';

interface SeedSource {
  name: string;
  kind: string;
  baseUrl?: string;
  token?: string;
  config?: object;
  priority: number;
  trustScore: number;
  note?: string;
}

const SOURCES: SeedSource[] = [
  {
    name: 'Wellmix',
    kind: 'api',
    baseUrl: 'https://wellmix-pump.ru/api/',
    token: 'ddcf984ad57512fa61fb4cac451a7844', // ПРИМЕР из доки — заменить реальным
    config: {
      provider: 'wellmix',
      endpoints: { params: 'parameters/get/', select: 'performance/get/' },
      paramMap: { efficiency: 'Q', pressure: 'H', power_from: 'мощность_от', power_to: 'мощность_до' },
    },
    priority: 10,
    trustScore: 8,
    note: '⚠ токен — пример из документации (не работает). Вставьте реальный токен клиента.',
  },
  {
    name: 'Каталог g-station (БД)',
    kind: 'catalog_db',
    priority: 5,
    trustScore: 10,
    note: 'Наш каталог CatalogItem — MCP search_catalog / find_pump_by_sku.',
  },
  {
    name: 'Доверенные сайты-каталоги',
    kind: 'web_trusted',
    config: { catalogUrls: [] as string[] },
    priority: 50,
    trustScore: 7,
    note: 'Впишите адреса каталогов на доверенных сайтах (список). Агент ищет по ним перед свободным вебом.',
  },
];

async function main() {
  for (const s of SOURCES) {
    const existing = await db.source.findFirst({ where: { name: s.name } });
    if (existing) { console.log(`${s.name}: уже есть — не трогаю.`); continue; }
    await db.source.create({
      data: {
        name: s.name, kind: s.kind, baseUrl: s.baseUrl ?? null, token: s.token ?? null,
        config: s.config ?? undefined, priority: s.priority, trustScore: s.trustScore,
        active: true, note: s.note ?? null,
      },
    });
    console.log(`${s.name}: заведён источник (${s.kind}).`);
  }
  console.log('✓ Засев источников завершён.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
