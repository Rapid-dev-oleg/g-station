import { listSources } from '@/server/actions/sources';
import { SourcesManager } from '@/components/admin/SourcesManager';

export const dynamic = 'force-dynamic';

/** Реестр источников подбора (каталог БД / API / доверенные сайты). Супер-админ. */
export default async function SourcesPage() {
  const sources = await listSources();
  return <SourcesManager sources={sources} />;
}
