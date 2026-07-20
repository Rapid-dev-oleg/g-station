/**
 * Мгновенный скелетон при навигации между страницами. Без него каждый переход
 * (все страницы force-dynamic) висит ~0.4–0.9с без отклика — ощущение «тупит».
 * Next показывает этот фолбэк сразу и прелоадит границу, страница стримится.
 * Sidebar/Header (в layout) остаются — мигает только область контента.
 */
export default function Loading() {
  const bar = (w: string, h = 14) => (
    <div className="sk" style={{ width: w, height: h, borderRadius: 6 }} />
  );
  return (
    <div style={{ padding: '4px 2px' }} aria-busy="true" aria-label="Загрузка">
      <style>{`
        .sk { background: linear-gradient(90deg,
          var(--surface-2,#eef2f6) 25%, var(--border,#dfe6ec) 37%, var(--surface-2,#eef2f6) 63%);
          background-size: 400% 100%; animation: sk 1.2s ease-in-out infinite; }
        @keyframes sk { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }
        @media (prefers-reduced-motion: reduce) { .sk { animation: none; opacity: .7 } }
        @media (prefers-color-scheme: dark) { .sk {
          background: linear-gradient(90deg, #16202b 25%, #23303c 37%, #16202b 63%);
          background-size: 400% 100%; } }
        .sk-card { border: 1px solid var(--border,#dfe6ec); border-radius: 12px; padding: 18px;
          display: flex; flex-direction: column; gap: 12px; background: var(--surface,#fff); }
        @media (prefers-color-scheme: dark) { .sk-card { border-color:#23303c; background:#141e28 } }
      `}</style>

      {/* заголовок страницы */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {bar('220px', 22)}
        {bar('340px', 13)}
      </div>

      {/* карточки-заглушки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk-card">
            {bar('55%', 12)}
            {bar('80%')}
            {bar('40%')}
          </div>
        ))}
      </div>

      {/* строки-заглушки (таблица/список) */}
      <div className="sk-card" style={{ marginTop: 16, gap: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {bar('24px', 24)}
            {bar('30%')}
            {bar('20%')}
            <div style={{ flex: 1 }} />
            {bar('80px')}
          </div>
        ))}
      </div>
    </div>
  );
}
