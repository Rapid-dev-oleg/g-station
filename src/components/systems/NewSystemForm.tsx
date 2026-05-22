'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, IconFlame, Input } from '@/components/ui';
import { createSystem } from '@/server/actions/systems';
import styles from '@/components/clients/ClientForm.module.css';

export function NewSystemForm({
  projectId,
  engineerId,
}: {
  projectId: string;
  engineerId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('Пожарная насосная станция');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (name.trim().length < 2) {
      setError('Введите название системы');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createSystem({
          name: name.trim(),
          projectId,
          typeCode: 'fire',
          engineerId,
        });
        router.push(`/projects/${projectId}/systems/${id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка создания');
      }
    });
  };

  return (
    <Card>
      <div className={styles.form}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            border: '1px solid var(--brand)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--brand-light)',
          }}
        >
          <span style={{ color: 'var(--brand)' }}>
            <IconFlame />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>Пожарная система</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Насосная станция пожаротушения (ВПВ, АУПТ, наружное ПТ)
            </div>
          </div>
        </div>

        <Input
          label="Название системы"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
        />

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Создание…' : 'Создать и открыть карточку'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
