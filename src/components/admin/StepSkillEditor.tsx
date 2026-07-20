'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { saveSkillFile, proposeSkillEdit, getSkillFileVersion, type SkillVersionRow } from '@/server/actions/skills';

/**
 * Редактор скила одного степа: текст файла методики + 🤖 ИИ-помощник (описал
 * правку словами → ИИ переписал → сверил → сохранил/откатил). Правка сразу
 * влияет на агента. Скилы шагов общие для типов на этом скиле.
 */
export function StepSkillEditor({
  code, title, path, initialContent, missing, versions,
}: { code: string; title: string; path: string; initialContent: string; missing: boolean; versions: SkillVersionRow[] }) {
  const router = useRouter();
  const back = () => router.push(`/admin/types/${code}/steps`);
  const [content, setContent] = useState(initialContent);
  const [original, setOriginal] = useState(initialContent);
  const [status, setStatus] = useState<string | null>(missing ? 'Файла ещё нет — создастся при сохранении' : null);
  const [saving, startSave] = useTransition();
  const [instruction, setInstruction] = useState('');
  const [proposing, startPropose] = useTransition();
  const [aiProposed, setAiProposed] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [restoring, startRestore] = useTransition();

  const dirty = content !== original;
  const curVersion = versions[0]?.version ?? 0;

  function save() {
    setStatus(null);
    startSave(async () => {
      const r = await saveSkillFile(path, content, aiProposed ? 'ИИ-правка' : 'ручная правка');
      if (r.ok) { setOriginal(content); setAiProposed(false); setStatus(`Сохранено (v${r.version}) — агент применит при следующем расчёте`); router.refresh(); }
      else setStatus('Ошибка: ' + r.error);
    });
  }

  function openVersion(v: SkillVersionRow) {
    startRestore(async () => {
      const r = await getSkillFileVersion(v.id);
      if (r) { setContent(r.content); setAiProposed(false); setShowHistory(false); setStatus(`Загружена версия v${v.version} — проверьте и сохраните, чтобы применить (создаст новую версию)`); }
    });
  }

  function propose() {
    if (!instruction.trim()) return;
    setAiError(null); setStatus(null);
    startPropose(async () => {
      const r = await proposeSkillEdit(path, instruction);
      if (r.ok) { setContent(r.content); setAiProposed(true); }
      else setAiError(r.error);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={back}>← Назад к шагам</Button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <code style={{ fontSize: 12, color: '#889', fontFamily: 'var(--font-mono,monospace)' }}>{path}</code>
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted,#667)' }}>Текст скила этого шага — правь вручную или через ИИ ниже.</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {curVersion > 0 && <Badge variant="default">v{curVersion}</Badge>}
            {dirty && <Badge variant="warning">не сохранено</Badge>}
            {versions.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
                История{versions.length ? ` · ${versions.length}` : ''}
              </Button>
            )}
            <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button>
          </div>
        </div>

        {showHistory && (
          <div style={{ marginBottom: 12, border: '1px solid var(--border,#e3e6ea)', borderRadius: 10, overflow: 'hidden' }}>
            {versions.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderTop: '1px solid var(--border-soft,#eef2f6)', fontSize: 13 }}>
                <Badge variant={v.version === curVersion ? 'success' : 'default'}>v{v.version}</Badge>
                <span style={{ flex: 1, color: 'var(--text-muted,#667)' }}>{v.note ?? '—'}</span>
                <span style={{ fontSize: 12, color: '#889', fontVariantNumeric: 'tabular-nums' }}>{new Date(v.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <Button size="sm" variant="ghost" disabled={restoring} onClick={() => openVersion(v)}>Открыть</Button>
              </div>
            ))}
          </div>
        )}

        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={26}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />

        {status && (
          <div style={{ marginTop: 8, fontSize: 13, color: status.startsWith('Ошибка') ? '#dc2626' : '#16a34a' }}>{status}</div>
        )}

        {aiProposed && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(180,120,20,.1)', border: '1px solid rgba(180,120,20,.3)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>🤖 ИИ переписал скил по вашему описанию. Проверьте текст выше и <b>сохраните</b>, либо откатите.</span>
            <Button size="sm" variant="ghost" onClick={() => { setContent(original); setAiProposed(false); }} style={{ marginLeft: 'auto' }}>Откатить</Button>
          </div>
        )}

        {/* ИИ-помощник */}
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: '1px solid var(--border,#e3e6ea)', background: 'var(--surface-2,#f7f9fb)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>🤖 ИИ-помощник по правке скила</div>
          <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2}
            placeholder="Опишите правку словами. Напр.: «запас на рабочую точку считать 10 %, а не 5–10 %»."
            style={{ width: '100%', fontSize: 13 }} disabled={proposing} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" onClick={propose} disabled={proposing || !instruction.trim()}>{proposing ? 'ИИ думает…' : 'Предложить правку'}</Button>
            <span style={{ fontSize: 12, color: 'var(--text-muted,#667)' }}>ИИ вернёт изменённый скил — вы проверите и сохраните. Без авто-перезаписи.</span>
          </div>
          {aiError && <div style={{ fontSize: 13, color: '#dc2626' }}>Ошибка: {aiError}</div>}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="secondary" onClick={back}>← Назад к шагам</Button>
        {dirty && <span style={{ fontSize: 12.5, color: 'var(--text-muted,#667)' }}>Есть несохранённые изменения</span>}
      </div>
    </div>
  );
}
