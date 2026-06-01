'use client';

import { useMemo, useState, useTransition } from 'react';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { readSkillFile, saveSkillFile, type SkillFile } from '@/server/actions/skills';

const ROOT_LABEL: Record<string, string> = {
  '.claude/skills': 'Скил (методика)',
  KNOWLEDGE: 'База знаний',
};

export function MethodologyEditor({ files }: { files: SkillFile[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const groups = useMemo(() => {
    const m = new Map<string, SkillFile[]>();
    for (const f of files) (m.get(f.root) ?? m.set(f.root, []).get(f.root)!).push(f);
    return [...m.entries()];
  }, [files]);

  const dirty = content !== original;

  function open(path: string) {
    setStatus(null);
    startLoad(async () => {
      const r = await readSkillFile(path);
      setActive(path);
      setContent(r.content);
      setOriginal(r.content);
    });
  }

  function save() {
    if (!active) return;
    setStatus(null);
    startSave(async () => {
      const r = await saveSkillFile(active, content);
      if (r.ok) {
        setOriginal(content);
        setStatus('Сохранено — агент применит при следующем расчёте');
      } else {
        setStatus('Ошибка: ' + r.error);
      }
    });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
      <Card>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
          {files.length} файлов · правка влияет на расчёт
        </div>
        {groups.map(([root, items]) => (
          <div key={root} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', margin: '6px 0' }}>
              {ROOT_LABEL[root] ?? root}
            </div>
            {items.map((f) => (
              <button
                key={f.path}
                onClick={() => open(f.path)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                  borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: active === f.path ? '#e0f2fe' : 'transparent',
                  color: active === f.path ? '#0369a1' : '#334155',
                }}
              >
                {f.path.replace(root + '/', '')}
              </button>
            ))}
          </div>
        ))}
      </Card>

      <Card>
        {active ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <code style={{ fontSize: 13 }}>{active}</code>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {dirty && <Badge>не сохранено</Badge>}
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving ? 'Сохраняю…' : 'Сохранить'}
                </Button>
              </div>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={28}
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              disabled={loading}
            />
            {status && (
              <div style={{ marginTop: 8, fontSize: 13, color: status.startsWith('Ошибка') ? '#dc2626' : '#16a34a' }}>
                {status}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#94a3b8', padding: 24 }}>Выберите файл слева для редактирования.</div>
        )}
      </Card>
    </div>
  );
}
