'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@/components/ui';
import { listJobs, cancelJob, type JobView } from '@/server/actions/jobs';

const STATUS: Record<string, { label: string; color: string }> = {
  queued: { label: 'в очереди', color: '#64748b' },
  running: { label: 'выполняется', color: '#0369a1' },
  done: { label: 'готово', color: '#16a34a' },
  error: { label: 'ошибка', color: '#dc2626' },
  cancelled: { label: 'остановлено', color: '#b45309' },
};
const TYPE: Record<string, string> = { parse: 'Парсинг ТЗ', calc: 'Расчёт станции', pipeline: 'Расчёт (конвейер)' };

export function JobsList({ initial }: { initial: JobView[] }) {
  const [jobs, setJobs] = useState<JobView[]>(initial);
  const [stopping, setStopping] = useState<Record<string, boolean>>({});

  // Поллим, пока есть активные задачи (иначе раз в 10 с для свежести).
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    const period = hasActive ? 3000 : 10000;
    const t = setInterval(async () => setJobs(await listJobs(30)), period);
    return () => clearInterval(t);
  }, [jobs]);

  async function stop(id: string) {
    setStopping((s) => ({ ...s, [id]: true }));
    // Оптимистично показываем сообщение; точный статус подтянет ближайший полл.
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, message: 'Останавливаю…' } : j)));
    await cancelJob(id).catch(() => {});
    setJobs(await listJobs(30));
    setStopping((s) => ({ ...s, [id]: false }));
  }

  if (jobs.length === 0) {
    return <Card><div style={{ color: '#94a3b8', padding: 16 }}>Задач пока нет.</div></Card>;
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((j) => {
          const st = STATUS[j.status] ?? { label: j.status, color: '#64748b' };
          // Пайплайн-расчёт → страница прогона (можно вернуться к живому/готовому).
          const link = j.type === 'pipeline' && j.runId ? `/calc/runs/${j.runId}`
            : j.systemId && j.projectId ? `/projects/${j.projectId}/systems/${j.systemId}`
            : j.projectId ? `/projects/${j.projectId}` : null;
          const row = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ fontSize: 12, color: st.color, fontWeight: 600, minWidth: 96 }}>{st.label}</span>
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>{TYPE[j.type] ?? j.type}</b>
                {j.label ? ` · ${j.label}` : ''}
                {j.message ? <span style={{ color: '#64748b', fontSize: 12 }}> — {j.message}</span> : ''}
                {j.error ? <span style={{ color: '#dc2626', fontSize: 12 }}> — {j.error}</span> : ''}
              </span>
              {(j.status === 'running' || j.status === 'queued') && (
                <span style={{ width: 120, height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${j.progress}%`, background: '#0ea5e9' }} />
                </span>
              )}
              {(j.status === 'running' || j.status === 'queued') && (
                <button
                  type="button"
                  disabled={stopping[j.id]}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void stop(j.id);
                  }}
                  style={{
                    fontSize: 12,
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    borderRadius: 6,
                    padding: '3px 8px',
                    cursor: stopping[j.id] ? 'default' : 'pointer',
                    opacity: stopping[j.id] ? 0.6 : 1,
                  }}
                >
                  {stopping[j.id] ? '…' : 'Остановить'}
                </button>
              )}
              {j.status === 'done' && <Badge>✓</Badge>}
            </div>
          );
          return <div key={j.id}>{link ? <Link href={link} style={{ textDecoration: 'none', color: 'inherit' }}>{row}</Link> : row}</div>;
        })}
      </div>
    </Card>
  );
}
