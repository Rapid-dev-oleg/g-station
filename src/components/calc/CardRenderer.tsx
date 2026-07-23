import type { CSSProperties } from 'react';
import { Card } from '@/components/ui';
import type { RunSummary } from '@/server/pipeline/runner';
import { blockTitle, type CardLayout, type CardBlock } from '@/lib/card/layout';

/**
 * Рендер карточки РЕЗУЛЬТАТА расчёта по дизайну-конфигу (CardLayout). Приложение
 * рисует блоки из каталога; порядок/видимость/подписи задаёт `layout`. Используют
 * и итоговый экран прогона (RunView), и живой предпросмотр редактора дизайна.
 */

type Summary = RunSummary;
const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('ru-RU') : '—');
const eyebrow: CSSProperties = { fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-faint,#8b98a5)', fontWeight: 600 };
const th: CSSProperties = { textAlign: 'left', ...eyebrow, padding: '8px 12px', borderBottom: '1px solid var(--border,#dfe6ec)' };
const td: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)', fontSize: 13.5, verticalAlign: 'top' };
const tdNum: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono,monospace)' };

// ─── Блоки каталога ────────────────────────────────────────────────────────

function HeaderBlock({ s }: { s: Summary }) {
  if (!s.cipher && s.estimate?.client_price == null) return null;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '16px 20px' }}>
        {s.cipher && (
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Шифр изделия</div>
            <div style={{ fontFamily: 'var(--font-mono,monospace)', fontWeight: 640, fontSize: 17, color: 'var(--hydro,#1668a8)', wordBreak: 'break-all' }}>{s.cipher}</div>
          </div>
        )}
        {s.estimate?.client_price != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={eyebrow}>Цена клиенту</div>
            <div style={{ fontSize: 25, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.estimate.client_price)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted,#667)' }}>₽</span></div>
            {s.estimate.cost_total != null && <div style={{ fontSize: 12, color: 'var(--text-muted,#667)' }}>себестоимость {fmt(s.estimate.cost_total)} ₽</div>}
          </div>
        )}
      </div>
    </Card>
  );
}

function CharacteristicsBlock({ s, title }: { s: Summary; title: string }) {
  const c = s.characteristics ?? {};
  const chips: [string, string | undefined][] = [
    ['Расход Q', c.Q], ['Напор H', c.H], ['Схема', c.scheme], ['Насос', c.pump], ['Мощность', c.power], ['Пуск', c.start],
  ];
  if (!chips.some(([, v]) => v)) return null;
  return (
    <Card><div style={{ padding: '16px 20px' }}>
      <div style={{ ...eyebrow, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {chips.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ border: '1px solid var(--border,#dfe6ec)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface-2,#f6f8fa)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint,#8b98a5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 620, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
    </div></Card>
  );
}

function EquipmentBlock({ s, title }: { s: Summary; title: string }) {
  if (!s.equipment?.length) return null;
  return (
    <Card>
      <div style={{ padding: '15px 20px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)', display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14.5 }}>{title}</strong><span style={eyebrow}>{s.equipment.length} позиций</span>
      </div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><th style={th}>Позиция</th><th style={th}>Характеристика</th><th style={{ ...th, textAlign: 'right' }}>Кол-во</th></tr>
          {s.equipment.map((e, i) => (
            <tr key={i}><td style={{ ...td, fontWeight: 600 }}>{e.name}</td><td style={{ ...td, color: 'var(--text-muted,#556)' }}>{e.spec ?? '—'}</td><td style={tdNum}>{e.qty ?? '—'}</td></tr>
          ))}
        </tbody>
      </table></div>
    </Card>
  );
}

function EstimateBlock({ s, title }: { s: Summary; title: string }) {
  if (!s.estimate?.rows?.length) return null;
  return (
    <Card>
      <div style={{ padding: '15px 20px 12px', borderBottom: '1px solid var(--border-soft,#eef2f6)' }}><strong style={{ fontSize: 14.5 }}>{title}</strong></div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><th style={th}>Группа · позиция</th><th style={th}>Источник</th><th style={{ ...th, textAlign: 'right' }}>Закупка, ₽</th></tr>
          {s.estimate.rows.map((r, i) => (
            <tr key={i}><td style={td}>{r.item}</td><td style={td}>{r.source && <span style={{ fontSize: 10.5, borderRadius: 999, padding: '1px 7px', color: /бд|db/i.test(r.source) ? 'var(--ok,#1f9d63)' : 'var(--gate,#b7791f)', background: /бд|db/i.test(r.source) ? 'color-mix(in srgb,var(--ok,#1f9d63) 14%,transparent)' : 'color-mix(in srgb,var(--gate,#b7791f) 14%,transparent)' }}>{r.source}</span>}</td><td style={tdNum}>{fmt(r.cost)}</td></tr>
          ))}
          {s.estimate.cost_total != null && <tr style={{ fontWeight: 700 }}><td style={{ ...td, borderTop: '2px solid var(--border,#dfe6ec)' }}>Себестоимость</td><td style={{ ...td, borderTop: '2px solid var(--border,#dfe6ec)' }}></td><td style={{ ...tdNum, borderTop: '2px solid var(--border,#dfe6ec)' }}>{fmt(s.estimate.cost_total)}</td></tr>}
          {s.estimate.client_price != null && <tr style={{ fontWeight: 700 }}><td style={td}>Цена клиенту</td><td style={td}></td><td style={{ ...tdNum, color: 'var(--hydro,#1668a8)' }}>{fmt(s.estimate.client_price)}</td></tr>}
        </tbody>
      </table></div>
    </Card>
  );
}

function GatesBlock({ s, title }: { s: Summary; title: string }) {
  if (!s.gates?.length) return null;
  return (
    <Card><div style={{ padding: '15px 20px' }}>
      <div style={{ ...eyebrow, marginBottom: 10 }}>{title}</div>
      {s.gates.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13, padding: '6px 0', borderTop: i ? '1px solid var(--border-soft,#eef2f6)' : 'none' }}>
          <span style={{ color: 'var(--gate,#b7791f)' }}>◆</span><span>{g}</span>
        </div>
      ))}
    </div></Card>
  );
}

function renderBlock(b: CardBlock, s: Summary) {
  const title = blockTitle(b);
  switch (b.type) {
    case 'header': return <HeaderBlock s={s} />;
    case 'characteristics': return <CharacteristicsBlock s={s} title={title} />;
    case 'equipment': return <EquipmentBlock s={s} title={title} />;
    case 'estimate': return <EstimateBlock s={s} title={title} />;
    case 'gates': return <GatesBlock s={s} title={title} />;
    default: return null;
  }
}

/** Карточка результата по дизайну-конфигу. */
export function CardRenderer({ layout, s }: { layout: CardLayout; s: Summary }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {layout.filter((b) => !b.hidden).map((b) => <div key={b.type}>{renderBlock(b, s)}</div>)}
    </div>
  );
}
