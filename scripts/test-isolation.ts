/**
 * Тест изоляции данных по воркспейсу (одноразовый). Создаёт временный воркспейс
 * B с клиентом/проектом и проверяет, что скоуп-клиент воркспейса A их НЕ видит и
 * не может изменить/удалить, и наоборот. В конце — чистит за собой.
 *
 * Запуск: npx tsx scripts/test-isolation.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { scopedDb } from '../src/server/workspace-db';

const raw = new PrismaClient();
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗ ПРОВАЛ'}  ${name}`);
  ok ? pass++ : fail++;
}

async function main() {
  const A = await raw.workspace.findUniqueOrThrow({ where: { id: 'default' } });
  const B = await raw.workspace.create({ data: { name: 'ТЕСТ-Изоляция-B' } });

  // Данные в B (напрямую, с workspaceId=B).
  const clientB = await raw.client.create({ data: { shortName: 'Клиент-B', workspaceId: B.id } });
  const projB = await raw.project.create({
    data: { name: 'Проект-B', objectName: 'Объект-B', clientId: clientB.id, ownerId: (await raw.user.findFirstOrThrow()).id, workspaceId: B.id },
  });

  const dbA = scopedDb(A.id);
  const dbB = scopedDb(B.id);

  // 1. Счётчики: A не включает данные B.
  const aProjIds = (await dbA.project.findMany({ select: { id: true } })).map((p) => p.id);
  check('A.projects НЕ содержит проект B', !aProjIds.includes(projB.id));
  const bProjIds = (await dbB.project.findMany({ select: { id: true } })).map((p) => p.id);
  check('B.projects содержит проект B', bProjIds.includes(projB.id));
  check('B.projects НЕ содержит проекты A', bProjIds.length === 1);

  // 2. findUnique по чужому id → null (пост-фильтр).
  check('A.findUnique(проект B) === null', (await dbA.project.findUnique({ where: { id: projB.id } })) === null);
  check('B.findUnique(проект B) !== null', (await dbB.project.findUnique({ where: { id: projB.id } })) !== null);
  check('A.findUnique(клиент B) === null', (await dbA.client.findUnique({ where: { id: clientB.id } })) === null);

  // 3. update/delete чужого — 0 затронутых.
  const upd = await dbA.project.updateMany({ where: { id: projB.id }, data: { name: 'ВЗЛОМ' } });
  check('A.updateMany(проект B) затронул 0 строк', upd.count === 0);
  const stillB = await raw.project.findUnique({ where: { id: projB.id } });
  check('имя проекта B не изменилось', stillB?.name === 'Проект-B');
  const del = await dbA.client.deleteMany({ where: { id: clientB.id } });
  check('A.deleteMany(клиент B) затронул 0 строк', del.count === 0);
  check('клиент B цел', (await raw.client.findUnique({ where: { id: clientB.id } })) !== null);

  // 4. create через A получает workspaceId=A (не B).
  const newA = await dbA.client.create({ data: { shortName: 'Клиент-A-тест' } });
  const newAraw = await raw.client.findUnique({ where: { id: newA.id } });
  check('create через A → workspaceId = A', newAraw?.workspaceId === A.id);
  check('новый клиент A не виден в B', (await dbB.client.findUnique({ where: { id: newA.id } })) === null);

  // Чистка.
  await raw.client.delete({ where: { id: newA.id } }).catch(() => {});
  await raw.project.deleteMany({ where: { workspaceId: B.id } });
  await raw.client.deleteMany({ where: { workspaceId: B.id } });
  await raw.workspace.delete({ where: { id: B.id } });

  console.log(`\nИТОГ: ${pass} ок, ${fail} провал(ов)`);
  await raw.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
