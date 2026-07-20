import { PageHeader } from '@/components/layout/PageHeader';
import { CalcWizard } from '@/components/calc/CalcWizard';
import { requireUser } from '@/server/auth';
import { getProjects } from '@/server/services/projects';
import { db } from '@/server/db';
import type { FieldSpec } from '@/lib/schema/types';

export const dynamic = 'force-dynamic';

/**
 * Новый расчёт — мастер (Фаза 1). Шаги мастера = шаги пайплайна типа; сейчас
 * реализован шаг 1 «Вход»: тип + клиент/проект (опц.) + карточка по схеме
 * (вручную или из файлов). Отдельный флоу — старый /intake не затрагивает.
 * Доступ — любой инженер (типы/схемы глобальные, не воркспейс-скоуп).
 */
export default async function NewCalcPage() {
  const [user, projects, typeRows] = await Promise.all([
    requireUser(),
    getProjects(),
    db.systemType.findMany({
      where: { code: { not: 'base' } },
      include: { schemas: { where: { status: 'active' }, orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const types = typeRows.map((t) => {
    const fields = (t.schemas[0]?.fields as unknown as FieldSpec[]) ?? [];
    return {
      code: t.code,
      name: t.name,
      status: t.status as string,
      ready: t.status === 'READY' && fields.length > 0,
      fields,
    };
  });

  return (
    <>
      <PageHeader
        title="Новый расчёт"
        subtitle="Шаг 1 · Вход — тип станции и карточка параметров (вручную или из ТЗ)"
      />
      <CalcWizard
        ownerId={user.id}
        types={types}
        projects={projects.map((p) => ({ id: p.id, name: p.name, clientName: p.client.shortName }))}
      />
    </>
  );
}
