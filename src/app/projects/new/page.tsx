'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Button, Card, IconArrowLeft, IconArrowRight, IconCheck, IconPlus, Input, NumberInput, Select, toast,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import type { Client, LegalForm, Project } from '@/lib/types';
import styles from './page.module.css';

const innRegex = /^(\d{10}|\d{12})$/;

export default function NewProjectPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Загрузка…</div>}>
      <NewProjectPageInner />
    </Suspense>
  );
}

function NewProjectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetClientId = searchParams?.get('clientId') ?? '';

  const { clients, addClient, findById } = useClientsStore();
  const { addProject } = useProjectsStore();

  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState(presetClientId);
  const [showCreate, setShowCreate] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // step A — inline new client (minimum fields)
  const [newClient, setNewClient] = useState({ inn: '', shortName: '', legalForm: 'OOO' as LegalForm, legalAddress: '' });
  const [newClientErrors, setNewClientErrors] = useState<{ inn?: string; shortName?: string; legalAddress?: string }>({});

  // step B — object
  const [objectName, setObjectName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');

  // step C — terms
  const [leadTimeWeeks, setLeadTimeWeeks] = useState(9);
  const [vatPct, setVatPct] = useState(20);
  const [prepaymentPct, setPrepaymentPct] = useState(50);
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [basis, setBasis] = useState<'EXW' | 'FCA' | 'DAP' | 'CIP'>('DAP');
  const [validityDays, setValidityDays] = useState(30);
  const [currency, setCurrency] = useState<'RUB' | 'USD'>('RUB');
  const [usdRate, setUsdRate] = useState(82);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    return clients
      .filter((c) => c.inn.includes(q) || c.shortName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clientSearch, clients]);

  const currentClient = clientId ? findById(clientId) : undefined;

  const stepValid = (s: number): boolean => {
    if (s === 0) return Boolean(clientId);
    if (s === 1) return objectName.trim().length > 1 && projectName.trim().length > 1;
    return true;
  };

  const createInlineClient = () => {
    const errs: typeof newClientErrors = {};
    if (!innRegex.test(newClient.inn)) errs.inn = 'ИНН должен быть 10 или 12 цифр';
    if (newClient.shortName.trim().length < 2) errs.shortName = 'Введите краткое имя';
    if (newClient.legalAddress.trim().length < 2) errs.legalAddress = 'Укажите юр. адрес';
    setNewClientErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (clients.find((c) => c.inn === newClient.inn)) {
      toast.error('Клиент с таким ИНН уже существует');
      return;
    }

    const c: Client = {
      id: `cli-${Date.now()}`,
      inn: newClient.inn,
      shortName: newClient.shortName,
      fullName: newClient.shortName,
      legalForm: newClient.legalForm,
      legalAddress: newClient.legalAddress,
      contacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addClient(c);
    setClientId(c.id);
    setShowCreate(false);
    toast.success('Клиент создан');
  };

  const finalize = () => {
    if (!currentClient) return;
    const now = new Date().toISOString();
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: projectName.trim(),
      status: 'draft',
      clientId: currentClient.id,
      primaryContactId: currentClient.contacts[0]?.id,
      object: {
        name: objectName.trim(),
        region: region || undefined,
        address: address || undefined,
        projectCode: projectCode || undefined,
      },
      terms: {
        leadTimeWeeks,
        vatPct,
        prepaymentPct,
        warrantyMonths,
        basis,
        validityDays,
        currency,
        usdRate: currency === 'USD' ? usdRate : usdRate,
      },
      systems: [],
      createdAt: now,
      updatedAt: now,
    };
    addProject(project);
    toast.success('Проект создан');
    router.push(`/projects/${project.id}`);
  };

  return (
    <>
      <PageHeader
        title="Новый проект"
        subtitle="Шаг 1 из 3: клиент, объект и условия поставки"
        actions={
          <Button variant="ghost" leftIcon={<IconArrowLeft />} onClick={() => router.back()}>
            Назад
          </Button>
        }
      />

      <div className={styles.steps}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={[
              styles.step,
              i < step ? styles.stepDone : '',
              i === step ? styles.stepActive : '',
            ].join(' ')}
          />
        ))}
      </div>

      <Card>
        {step === 0 && (
          <>
            <div className={styles.stepTitle}>А. Клиент</div>
            <div className={styles.stepHint}>Найдите по ИНН или краткому имени, либо создайте нового</div>
            <Input
              placeholder="Поиск клиента..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {filteredClients.map((c) => (
                <div
                  key={c.id}
                  className={[styles.clientHit, clientId === c.id ? styles.clientHitActive : ''].join(' ')}
                  onClick={() => setClientId(c.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>{c.shortName}</strong>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>ИНН {c.inn}</div>
                    </div>
                    {clientId === c.id && <Badge variant="success" withDot>Выбран</Badge>}
                  </div>
                </div>
              ))}
              {filteredClients.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Ничего не найдено</div>
              )}
            </div>
            {!showCreate ? (
              <Button variant="secondary" leftIcon={<IconPlus />} onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
                Создать нового клиента
              </Button>
            ) : (
              <div className={styles.inlineForm}>
                <div className={styles.row3}>
                  <Input
                    label="ИНН"
                    required
                    value={newClient.inn}
                    onChange={(e) => setNewClient((s) => ({ ...s, inn: e.target.value }))}
                    error={newClientErrors.inn}
                  />
                  <Input
                    label="Краткое имя"
                    required
                    value={newClient.shortName}
                    onChange={(e) => setNewClient((s) => ({ ...s, shortName: e.target.value }))}
                    error={newClientErrors.shortName}
                  />
                  <Select
                    label="Юр. форма"
                    value={newClient.legalForm}
                    onChange={(e) => setNewClient((s) => ({ ...s, legalForm: e.target.value as LegalForm }))}
                    options={[
                      { value: 'OOO', label: 'ООО' },
                      { value: 'AO', label: 'АО' },
                      { value: 'PAO', label: 'ПАО' },
                      { value: 'IP', label: 'ИП' },
                      { value: 'BUDG', label: 'Бюджетная' },
                      { value: 'OTHER', label: 'Другая' },
                    ]}
                  />
                </div>
                <Input
                  label="Юр. адрес"
                  required
                  value={newClient.legalAddress}
                  onChange={(e) => setNewClient((s) => ({ ...s, legalAddress: e.target.value }))}
                  error={newClientErrors.legalAddress}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="ghost" onClick={() => setShowCreate(false)}>Отмена</Button>
                  <Button onClick={createInlineClient}>Создать</Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className={styles.stepTitle}>Б. Объект</div>
            <div className={styles.stepHint}>Кому и куда поставляем</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <Input label="Название проекта" required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ЖК Саров — корректировка КНС" />
              <Input label="Название объекта" required value={objectName} onChange={(e) => setObjectName(e.target.value)} placeholder="ПАО «Дорогобуж». Цех АКВМ" />
              <div className={styles.row}>
                <Input label="Регион" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Нижегородская обл." />
                <Input label="Код проекта" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="74757-05/552" />
              </div>
              <Input label="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ул., д." />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className={styles.stepTitle}>В. Условия поставки</div>
            <div className={styles.stepHint}>Стандартные параметры — можно изменить позже в карточке проекта</div>
            <div className={styles.row4}>
              <NumberInput label="Срок поставки, нед." value={leadTimeWeeks} onChange={(e) => setLeadTimeWeeks(+e.target.value)} />
              <NumberInput label="НДС, %" value={vatPct} onChange={(e) => setVatPct(+e.target.value)} />
              <NumberInput label="Аванс, %" value={prepaymentPct} onChange={(e) => setPrepaymentPct(+e.target.value)} />
              <NumberInput label="Гарантия, мес." value={warrantyMonths} onChange={(e) => setWarrantyMonths(+e.target.value)} />
            </div>
            <div className={styles.row4} style={{ marginTop: 16 }}>
              <Select
                label="Базис поставки"
                value={basis}
                onChange={(e) => setBasis(e.target.value as any)}
                options={[
                  { value: 'EXW', label: 'EXW' },
                  { value: 'FCA', label: 'FCA' },
                  { value: 'DAP', label: 'DAP' },
                  { value: 'CIP', label: 'CIP' },
                ]}
              />
              <NumberInput label="Срок действия ТКП, дн." value={validityDays} onChange={(e) => setValidityDays(+e.target.value)} />
              <Select
                label="Валюта"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
                options={[
                  { value: 'RUB', label: 'RUB' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
              <NumberInput label="Курс USD" value={usdRate} onChange={(e) => setUsdRate(+e.target.value)} />
            </div>
          </>
        )}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            leftIcon={<IconArrowLeft />}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Назад
          </Button>
          {step < 2 ? (
            <Button
              rightIcon={<IconArrowRight />}
              onClick={() => setStep((s) => Math.min(2, s + 1))}
              disabled={!stepValid(step)}
            >
              Далее
            </Button>
          ) : (
            <Button leftIcon={<IconCheck />} onClick={finalize}>
              Создать проект
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
