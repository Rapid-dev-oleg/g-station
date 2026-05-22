'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button, Card, Input, Select } from '@/components/ui';
import { createProject } from '@/server/actions/projects';
import styles from '@/components/clients/ClientForm.module.css';

const schema = z.object({
  name: z.string().min(2, 'Введите название проекта'),
  objectName: z.string().min(2, 'Введите название объекта'),
  clientId: z.string().min(1, 'Выберите клиента'),
  deadline: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export interface ProjectFormProps {
  ownerId: string;
  clients: { id: string; shortName: string }[];
  presetClientId?: string;
}

export function ProjectForm({
  ownerId,
  clients,
  presetClientId,
}: ProjectFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      objectName: '',
      clientId: presetClientId ?? '',
      deadline: '',
    },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const { id } = await createProject({
          name: data.name,
          objectName: data.objectName,
          clientId: data.clientId,
          ownerId,
          deadline: data.deadline || null,
        });
        router.push(`/projects/${id}`);
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'Ошибка создания');
      }
    });
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <Select
          label="Клиент"
          required
          placeholder="— выберите клиента —"
          options={clients.map((c) => ({ value: c.id, label: c.shortName }))}
          {...register('clientId')}
          error={errors.clientId?.message}
        />
        <Input
          label="Название проекта"
          required
          placeholder="ЖК Саров — НС пожаротушения"
          {...register('name')}
          error={errors.name?.message}
        />
        <Input
          label="Название объекта"
          required
          placeholder="ПАО «Дорогобуж». Цех АКВМ"
          {...register('objectName')}
          error={errors.objectName?.message}
        />
        <Input label="Срок (дедлайн)" type="date" {...register('deadline')} />

        {serverError && <div className={styles.warn}>{serverError}</div>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Создание…' : 'Создать проект'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
