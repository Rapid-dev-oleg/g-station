'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge } from '@/components/ui';
import { startSystemPipeline } from '@/server/actions/pipeline';

/**
 * Мост System → конвейер (Фаза A). Запускает конвейерный прогон, привязанный к
 * этой системе (по готовности результат пишется обратно в System), и даёт вернуться
 * к последнему прогону. Живёт рядом со старым потоком (SystemFlow) — не заменяет его.
 */
export function SystemPipelinePanel({ systemId, pipelineRunId }: {
  systemId: string;
  pipelineRunId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try {
      const { id } = await startSystemPipeline(systemId);
      router.push(`/calc/runs/${id}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Не удалось запустить расчёт');
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '4px 2px' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 14.5 }}>Конвейерный расчёт</strong>
            <Badge variant="info">β</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted,#667)', marginTop: 3 }}>
            Расчёт по шагам типа в одной сессии агента; результат вернётся в эту систему.
          </div>
        </div>
        {pipelineRunId && (
          <Link href={`/calc/runs/${pipelineRunId}`}>
            <Button variant="secondary" size="sm">Открыть последний прогон</Button>
          </Link>
        )}
        <Button size="sm" disabled={busy} onClick={run}>
          {busy ? 'Запускаю…' : pipelineRunId ? 'Пересчитать' : 'Рассчитать через конвейер'}
        </Button>
      </div>
      {error && <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 13 }}>{error}</div>}
    </Card>
  );
}
