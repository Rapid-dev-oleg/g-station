'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge } from '@/components/ui';
import { setCalcEngine, type CalcTypeIdentity } from '@/server/actions/calc-types';

interface Summary {
  activeSchemaFields: number | null;
  hasDraftSchema: boolean;
  instructionItems: number;
  normsUsed: number;
}

export function TypeOverview({
  identity,
  summary,
}: {
  identity: CalcTypeIdentity & { code: string };
  summary: Summary;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConstructor = identity.calcEngine === 'constructor';
  const base = `/admin/types/${identity.code}`;

  async function switchEngine(engine: 'skill' | 'constructor') {
    if (engine === 'constructor' &&
      !confirm('Переключить на «Конструктор»? Тогда расчёт этого типа начнёт собираться из инструкций редактора, а не из скила. Для пожарки это менять НЕ нужно.')) return;
    setBusy(true); setError(null);
    const r = await setCalcEngine(identity.code, engine);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(200,60,50,.1)', color: '#c33', fontSize: 14 }}>{error}</div>}

      {/* Движок расчёта — главный переключатель «как считается тип» */}
      <Card title="Движок расчёта" subtitle="Как выполняется расчёт этого типа">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <EngineCard
            title="Скил" active={!isConstructor} busy={busy}
            desc="Считает готовая markdown-методика скила. Схема/инструкции/нормативы здесь — витрина (смотреть/вести), в расчёт НЕ вмешиваются."
            onPick={() => !isConstructor ? null : switchEngine('skill')} />
          <EngineCard
            title="Конструктор" active={isConstructor} busy={busy}
            desc="Расчёт собирается из инструкций этого редактора + нормы (подмешиваются в промпт агента). Для новых типов."
            onPick={() => isConstructor ? null : switchEngine('constructor')} />
        </div>
        {!isConstructor && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#667' }}>
            Пожарка и другие готовые типы держатся на «Скил» — расчёт не меняется, даже если инструкции ниже заполнены.
          </p>
        )}
      </Card>

      {/* Идентичность */}
      <Card title="Идентичность" action={<Badge variant={statusVariant(identity.status)}>{identity.status}</Badge>}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 16px', margin: 0, fontSize: 14 }}>
          <dt style={dt}>Название</dt><dd style={dd}>{identity.name}</dd>
          {identity.description && <><dt style={dt}>Описание</dt><dd style={dd}>{identity.description}</dd></>}
          {identity.skillName && <><dt style={dt}>Скил</dt><dd style={dd}><code>{identity.skillName}</code>{identity.typeModule ? ` · ${identity.typeModule}` : ''}</dd></>}
          {identity.purposes.length > 0 && <><dt style={dt}>Назначения</dt><dd style={dd}>{identity.purposes.join(', ')}</dd></>}
          {identity.triggers.length > 0 && <><dt style={dt}>Триггеры</dt><dd style={dd}>{identity.triggers.join(', ')}</dd></>}
        </dl>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#889' }}>Полное редактирование идентичности — в реестре типов (кнопка «Идентичность»).</p>
      </Card>

      {/* Состав — быстрые ссылки на табы */}
      <Card title="Состав типа" subtitle="Схема ввода · методика · нормы">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatLink href={`${base}/schema`} label="Схема"
            value={summary.activeSchemaFields != null ? `${summary.activeSchemaFields} полей` : 'нет активной'}
            hint={summary.hasDraftSchema ? 'есть черновик' : undefined} />
          <StatLink href={`${base}/instructions`} label="Инструкции"
            value={summary.instructionItems ? `${summary.instructionItems} пунктов` : 'пусто'} />
          <StatLink href={`${base}/norms`} label="Нормативы"
            value={summary.normsUsed ? `${summary.normsUsed} норм` : 'нет ссылок'} />
        </div>
      </Card>
    </div>
  );
}

function EngineCard({ title, desc, active, busy, onPick }: { title: string; desc: string; active: boolean; busy: boolean; onPick: () => void }) {
  return (
    <div style={{
      flex: '1 1 260px', border: `2px solid ${active ? 'var(--hydro,#1668a8)' : 'var(--border,#e3e6ea)'}`,
      borderRadius: 10, padding: 14, background: active ? 'rgba(22,104,168,.05)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong>{title}</strong>
        {active && <Badge variant="info" withDot>активен</Badge>}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#667' }}>{desc}</p>
      {!active && <Button size="sm" variant="secondary" disabled={busy} onClick={onPick}>Выбрать</Button>}
    </div>
  );
}

function StatLink({ href, label, value, hint }: { href: string; label: string; value: string; hint?: string }) {
  return (
    <Link href={href} style={{
      flex: '1 1 180px', textDecoration: 'none', color: 'inherit',
      border: '1px solid var(--border,#e3e6ea)', borderRadius: 10, padding: 14,
    }}>
      <div style={{ fontSize: 12, color: '#889', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--hydro,#1668a8)', marginTop: 2 }}>{hint}</div>}
    </Link>
  );
}

const dt = { color: '#889', fontWeight: 500 } as const;
const dd = { margin: 0 } as const;
function statusVariant(s: string): 'success' | 'info' | 'default' {
  return s === 'READY' ? 'success' : s === 'PLANNED' ? 'default' : 'info';
}
