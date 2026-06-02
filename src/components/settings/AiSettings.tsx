'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { AI_MODELS } from '@/server/ai/models';
import { updateAiSettings, testAi } from '@/server/actions/settings';

const FIELD: React.CSSProperties = { marginBottom: 14 };
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: 'var(--muted)',
  marginBottom: 6,
};
const CONTROL: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  background: '#fff',
};

export function AiSettings({
  initialKey,
  initialModel,
  initialKimiKey = '',
  initialCalcAgent = 'kimi',
}: {
  initialKey: string;
  initialModel: string;
  initialKimiKey?: string;
  initialCalcAgent?: string;
}) {
  const [apiKey, setApiKey] = useState(initialKey);
  const [model, setModel] = useState(initialModel || AI_MODELS[0].id);
  const [kimiKey, setKimiKey] = useState(initialKimiKey);
  const [calcAgent, setCalcAgent] = useState(initialCalcAgent === 'claude' ? 'claude' : 'kimi');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await updateAiSettings({ openrouterKey: apiKey, aiModel: model, kimiKey, calcAgent });
    setSaving(false);
    setSaved(true);
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    const r = await testAi({ apiKey, model });
    setTest((r.ok ? '✓ ' : '✗ ') + r.message);
    setTesting(false);
  }

  return (
    <Card title="ИИ — парсинг документов (OpenRouter)">
      <div style={FIELD}>
        <label style={LABEL}>Ключ OpenRouter API</label>
        <input
          style={CONTROL}
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setSaved(false);
          }}
          placeholder="sk-or-..."
          autoComplete="off"
        />
      </div>

      <div style={FIELD}>
        <label style={LABEL}>Модель</label>
        <select
          style={CONTROL}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setSaved(false);
          }}
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.note ? ` — ${m.note}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label style={LABEL}>Ключ Kimi API (расчёт через скил, парсинг сканов)</label>
        <input
          style={CONTROL}
          type="password"
          value={kimiKey}
          onChange={(e) => {
            setKimiKey(e.target.value);
            setSaved(false);
          }}
          placeholder="sk-kimi-..."
          autoComplete="off"
        />
      </div>

      <div style={FIELD}>
        <label style={LABEL}>Движок расчёта</label>
        <select
          style={CONTROL}
          value={calcAgent}
          onChange={(e) => {
            setCalcAgent(e.target.value);
            setSaved(false);
          }}
        >
          <option value="kimi">Kimi</option>
          <option value="claude">Claude</option>
        </select>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Чем считать станцию и собирать смету. Переключите, если текущий движок недоступен.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
        <Button variant="secondary" onClick={runTest} disabled={testing}>
          {testing ? 'Проверка…' : 'Проверить связь'}
        </Button>
        {saved && <span style={{ fontSize: 13, color: 'var(--success, green)' }}>Сохранено</span>}
      </div>

      {test && (
        <p
          style={{
            marginTop: 10,
            fontSize: 13,
            color: test.startsWith('✓') ? 'var(--success, green)' : 'var(--danger, #c0392b)',
            wordBreak: 'break-word',
          }}
        >
          {test}
        </p>
      )}
    </Card>
  );
}
