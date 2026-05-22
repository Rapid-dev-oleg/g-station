'use client';

import { useForm } from 'react-hook-form';
import { Button, Card, IconLogo, Input, Tabs, toast } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettingsStore, type CompanySettings } from '@/lib/store/settings';
import { useState } from 'react';
import styles from './page.module.css';

export default function CompanySettingsPage() {
  const { company, updateCompany, resetCompany } = useSettingsStore();
  const [tab, setTab] = useState('legal');

  const { register, handleSubmit, reset } = useForm<CompanySettings>({ defaultValues: company });

  const onSubmit = (data: CompanySettings) => {
    updateCompany(data);
    toast.success('Реквизиты сохранены');
  };

  return (
    <>
      <PageHeader title="Реквизиты компании" subtitle="Используются в шапке ТКП и в выгружаемых документах" />

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconLogo />
          <div>
            <div className={styles.preview}>{company.shortName}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{company.fullName}</div>
          </div>
        </div>
      </Card>

      <Card>
        <Tabs
          tabs={[
            { key: 'legal', label: 'Юр. данные' },
            { key: 'bank', label: 'Банк' },
            { key: 'people', label: 'Подписи' },
            { key: 'assets', label: 'Лого / печать' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <form onSubmit={handleSubmit(onSubmit)} className={styles.grid} style={{ marginTop: 24 }}>
          {tab === 'legal' && (
            <>
              <Input label="Краткое название" required {...register('shortName')} />
              <Input label="Полное наименование" required {...register('fullName')} />
              <div className={styles.row3}>
                <Input label="ИНН" required {...register('inn')} />
                <Input label="КПП" required {...register('kpp')} />
                <Input label="ОГРН" {...register('ogrn')} />
              </div>
              <Input label="Юр. адрес" required {...register('legalAddress')} />
              <Input label="Почтовый адрес" {...register('postAddress')} />
              <div className={styles.row3}>
                <Input label="Телефон" {...register('phone')} />
                <Input label="Email" {...register('email')} />
                <Input label="Сайт" {...register('website')} />
              </div>
            </>
          )}

          {tab === 'bank' && (
            <>
              <Input label="Банк" required {...register('bank.name')} />
              <div className={styles.row3}>
                <Input label="БИК" required {...register('bank.bik')} />
                <Input label="Р/счёт" required {...register('bank.account')} />
                <Input label="К/счёт" required {...register('bank.corrAccount')} />
              </div>
            </>
          )}

          {tab === 'people' && (
            <>
              <div className={styles.row}>
                <Input label="Директор (ФИО)" required {...register('director')} />
                <Input label="Должность (родит. падеж)" {...register('directorPositionGenitive')} hint='Например, "Генерального директора"' />
              </div>
              <Input label="Действует на основании" {...register('basis')} hint='Например, "Устава"' />
            </>
          )}

          {tab === 'assets' && (
            <div className={styles.placeholders}>
              <div className={styles.placeholder}>
                Лого: загружать файл — в MVP не реализовано<br />
                <span style={{ color: 'var(--muted-light)', fontSize: 11 }}>Используется текстовое лого «Гидрострой-НН»</span>
              </div>
              <div className={styles.placeholder}>
                Подпись + печать (PNG, прозрачный фон) — после демо
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetCompany();
                reset();
                toast.info('Сброшено к значениям по умолчанию');
              }}
            >
              Сбросить
            </Button>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
