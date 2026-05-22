'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { Button, Card, Input, Select, Tabs, Textarea, toast } from '@/components/ui';
import { useClientsStore } from '@/lib/store';
import type { Client, ClientTag, LegalForm } from '@/lib/types';
import styles from './ClientForm.module.css';

const innRegex = /^(\d{10}|\d{12})$/;

const schema = z.object({
  inn: z.string().regex(innRegex, 'ИНН должен быть 10 или 12 цифр'),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  shortName: z.string().min(2, 'Введите краткое имя'),
  fullName: z.string().min(2, 'Введите полное имя'),
  legalForm: z.string(),
  legalAddress: z.string().min(2, 'Укажите юр. адрес'),
  postAddress: z.string().optional(),
  bankName: z.string().optional(),
  bankBik: z.string().optional(),
  bankAccount: z.string().optional(),
  bankCorrAccount: z.string().optional(),
  contactFullName: z.string().optional(),
  contactPosition: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('Некорректный email').optional().or(z.literal('')),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const LEGAL_FORMS: { value: LegalForm; label: string }[] = [
  { value: 'OOO', label: 'ООО' },
  { value: 'AO', label: 'АО' },
  { value: 'PAO', label: 'ПАО' },
  { value: 'ZAO', label: 'ЗАО' },
  { value: 'IP', label: 'ИП' },
  { value: 'BUDG', label: 'Бюджетная' },
  { value: 'OTHER', label: 'Другая' },
];

const TAGS: ClientTag[] = ['промышленное', 'жилищное', 'муниципальное', 'коммерческое', 'лид'];

export interface ClientFormProps {
  initial?: Client;
  redirectTo?: string;
}

export function ClientForm({ initial, redirectTo }: ClientFormProps) {
  const router = useRouter();
  const { clients, addClient, updateClient } = useClientsStore();
  const [tab, setTab] = useState('requisites');
  const [tags, setTags] = useState<ClientTag[]>(initial?.tags ?? []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      inn: initial?.inn ?? '',
      kpp: initial?.kpp ?? '',
      ogrn: initial?.ogrn ?? '',
      shortName: initial?.shortName ?? '',
      fullName: initial?.fullName ?? '',
      legalForm: initial?.legalForm ?? 'OOO',
      legalAddress: initial?.legalAddress ?? '',
      postAddress: initial?.postAddress ?? '',
      bankName: initial?.bankAccount?.bankName ?? '',
      bankBik: initial?.bankAccount?.bik ?? '',
      bankAccount: initial?.bankAccount?.account ?? '',
      bankCorrAccount: initial?.bankAccount?.corrAccount ?? '',
      contactFullName: initial?.contacts[0]?.fullName ?? '',
      contactPosition: initial?.contacts[0]?.position ?? '',
      contactPhone: initial?.contacts[0]?.phone ?? '',
      contactEmail: initial?.contacts[0]?.email ?? '',
      note: initial?.note ?? '',
    },
  });

  const innValue = watch('inn');
  const innConflict = useMemo(() => {
    if (!innValue || !innRegex.test(innValue)) return null;
    const existing = clients.find((c) => c.inn === innValue && c.id !== initial?.id);
    return existing ?? null;
  }, [innValue, clients, initial]);

  const onSubmit = (data: FormData) => {
    const now = new Date().toISOString();
    const contact = data.contactFullName
      ? {
          id: initial?.contacts[0]?.id ?? `ct-${Date.now()}`,
          fullName: data.contactFullName,
          position: data.contactPosition,
          phone: data.contactPhone,
          email: data.contactEmail || undefined,
          source: 'customer' as const,
        }
      : undefined;
    const bank = data.bankName
      ? {
          bankName: data.bankName,
          bik: data.bankBik ?? '',
          account: data.bankAccount ?? '',
          corrAccount: data.bankCorrAccount ?? '',
        }
      : undefined;

    const next: Client = {
      id: initial?.id ?? `cli-${Date.now()}`,
      inn: data.inn,
      kpp: data.kpp || undefined,
      ogrn: data.ogrn || undefined,
      shortName: data.shortName,
      fullName: data.fullName,
      legalForm: data.legalForm as LegalForm,
      legalAddress: data.legalAddress,
      postAddress: data.postAddress || undefined,
      bankAccount: bank,
      contacts: contact ? [contact, ...(initial?.contacts.slice(1) ?? [])] : initial?.contacts ?? [],
      tags,
      note: data.note || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };

    if (initial) {
      updateClient(initial.id, next);
      toast.success('Клиент обновлён');
    } else {
      addClient(next);
      toast.success('Клиент создан');
    }

    router.push(redirectTo ?? `/clients/${next.id}`);
  };

  return (
    <Card>
      <Tabs
        tabs={[
          { key: 'requisites', label: 'Реквизиты' },
          { key: 'contacts', label: 'Контакты' },
          { key: 'bank', label: 'Банк' },
          { key: 'other', label: 'Прочее' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <form onSubmit={handleSubmit(onSubmit)} className={styles.formCard} style={{ marginTop: 24 }}>
        {tab === 'requisites' && (
          <>
            <div className={styles.row3}>
              <Input label="ИНН" required {...register('inn')} error={errors.inn?.message} placeholder="10 или 12 цифр" />
              <Input label="КПП" {...register('kpp')} placeholder="9 цифр" />
              <Input label="ОГРН" {...register('ogrn')} placeholder="13 цифр" />
            </div>
            {innConflict && (
              <div className={styles.warn}>
                Клиент с таким ИНН уже существует: <strong>{innConflict.shortName}</strong>.{' '}
                <Link href={`/clients/${innConflict.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                  Открыть карточку
                </Link>
              </div>
            )}
            <div className={styles.row}>
              <Input label="Краткое имя" required {...register('shortName')} error={errors.shortName?.message} placeholder="ООО «Ромашка»" />
              <Select label="Юр. форма" required {...register('legalForm')} options={LEGAL_FORMS} />
            </div>
            <Input label="Полное наименование" required {...register('fullName')} error={errors.fullName?.message} />
            <Input label="Юр. адрес" required {...register('legalAddress')} error={errors.legalAddress?.message} />
            <Input label="Почтовый адрес" {...register('postAddress')} hint="если отличается от юр. адреса" />
          </>
        )}

        {tab === 'contacts' && (
          <>
            <div className={styles.row}>
              <Input label="ФИО" {...register('contactFullName')} placeholder="Иванов Иван Иванович" />
              <Input label="Должность" {...register('contactPosition')} placeholder="Главный инженер" />
            </div>
            <div className={styles.row}>
              <Input label="Телефон" {...register('contactPhone')} placeholder="+7 ___" />
              <Input label="Email" {...register('contactEmail')} error={errors.contactEmail?.message} placeholder="email@example.com" />
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Дополнительные контакты можно добавить через карточку клиента после создания.
            </p>
          </>
        )}

        {tab === 'bank' && (
          <>
            <Input label="Банк" {...register('bankName')} placeholder="Волго-Вятский банк ПАО Сбербанк" />
            <div className={styles.row3}>
              <Input label="БИК" {...register('bankBik')} placeholder="9 цифр" />
              <Input label="Р/счёт" {...register('bankAccount')} placeholder="20 цифр" />
              <Input label="К/счёт" {...register('bankCorrAccount')} placeholder="20 цифр" />
            </div>
          </>
        )}

        {tab === 'other' && (
          <>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Теги</label>
              <div className={styles.tagPicker} style={{ marginTop: 8 }}>
                {TAGS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={[
                      styles.tagBtn,
                      tags.includes(t) ? styles.tagBtnActive : '',
                    ].join(' ')}
                    onClick={() =>
                      setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Textarea label="Заметка" rows={4} {...register('note')} placeholder="Внутренние комментарии, история взаимодействия и т. п." />
          </>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {initial ? 'Сохранить' : 'Создать клиента'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
