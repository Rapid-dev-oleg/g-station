'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button, Card, Input, Textarea } from '@/components/ui';
import {
  createClient,
  updateClient,
  type ClientInput,
} from '@/server/actions/clients';
import styles from './ClientForm.module.css';

const schema = z.object({
  shortName: z.string().min(2, 'Введите краткое имя'),
  fullName: z.string().optional(),
  inn: z
    .string()
    .optional()
    .refine((v) => !v || /^(\d{10}|\d{12})$/.test(v), 'ИНН — 10 или 12 цифр'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Некорректный email'),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export interface ClientFormProps {
  /** Существующий клиент для режима правки. */
  initial?: {
    id: string;
    shortName: string;
    fullName: string | null;
    inn: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    note: string | null;
  };
}

export function ClientForm({ initial }: ClientFormProps) {
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
      shortName: initial?.shortName ?? '',
      fullName: initial?.fullName ?? '',
      inn: initial?.inn ?? '',
      contactName: initial?.contactName ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      note: initial?.note ?? '',
    },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    const payload: ClientInput = {
      shortName: data.shortName,
      fullName: data.fullName || undefined,
      inn: data.inn || undefined,
      contactName: data.contactName || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      note: data.note || undefined,
    };
    startTransition(async () => {
      try {
        if (initial) {
          await updateClient(initial.id, payload);
          router.push(`/clients/${initial.id}`);
        } else {
          const { id } = await createClient(payload);
          router.push(`/clients/${id}`);
        }
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'Ошибка сохранения');
      }
    });
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <div className={styles.row}>
          <Input
            label="Краткое имя"
            required
            placeholder="ООО «Ромашка»"
            {...register('shortName')}
            error={errors.shortName?.message}
          />
          <Input label="ИНН" placeholder="10 или 12 цифр" {...register('inn')} error={errors.inn?.message} />
        </div>
        <Input label="Полное наименование" {...register('fullName')} />
        <div className={styles.row}>
          <Input label="Контактное лицо" placeholder="Иванов Иван" {...register('contactName')} />
          <Input label="Телефон" placeholder="+7 ___" {...register('phone')} />
        </div>
        <Input label="Email" placeholder="email@example.com" {...register('email')} error={errors.email?.message} />
        <Textarea label="Заметка" rows={3} {...register('note')} placeholder="Внутренние комментарии" />

        {serverError && <div className={styles.warn}>{serverError}</div>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Сохранение…' : initial ? 'Сохранить' : 'Создать клиента'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
