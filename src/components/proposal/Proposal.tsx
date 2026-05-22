'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, IconArrowLeft, IconDownload, IconExcel, IconMail, IconPrint, Modal, Input, toast } from '@/components/ui';
import { BomReplaceButton, OverridesBanner } from '@/components/bom';
import { useClientsStore, useProjectsStore, useSettingsStore, useStandardsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRub, formatDateLong, systemTypeLabel } from '@/lib/format';
import type { SystemTypeKey } from '@/lib/standards';
import { inlineSchemaSvg } from '@/lib/ai/imagen';
import { findPumpBySku } from '@/lib/catalog/pumps';
import { exportProposalXlsx } from './exportXlsx';
import styles from './Proposal.module.css';

export interface ProposalProps {
  projectId: string;
}

export function Proposal({ projectId }: ProposalProps) {
  const project = useProjectsStore((s) => s.findById(projectId));
  const client = useClientsStore((s) => (project ? s.findById(project.clientId) : undefined));
  const company = useSettingsStore((s) => s.company);
  const allStandards = useStandardsStore((s) => s.items);

  // Релевантные нормативы — те, что покрывают хотя бы один тип систем проекта,
  // и при этом действующие или рекомендуемые (отменённые в ТКП не показываем).
  const relevantStandards = useMemo(() => {
    if (!project) return [];
    const types = new Set<SystemTypeKey>(project.systems.map((s) => s.type as SystemTypeKey));
    return allStandards
      .filter((std) => std.status !== 'cancelled')
      .filter((std) => std.appliesTo.some((t) => types.has(t)));
  }, [project, allStandards]);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailValue, setEmailValue] = useState(client?.contacts[0]?.email ?? '');

  const data = useMemo(() => {
    if (!project) return null;
    let grand = 0;
    const systems = project.systems.map((s) => {
      const r = s.bom && s.totalCost !== undefined ? { bom: s.bom, computed: s.computed, totalCost: s.totalCost } : compute(s);
      grand += r.totalCost;
      return { system: s, ...r };
    });
    return { systems, grand };
  }, [project]);

  if (!project || !data) {
    return <p>Проект не найден.</p>;
  }

  const proposalId = `${project.id.replace('proj-', 'ТКП-')}/${new Date().getFullYear()}`;
  const today = new Date().toISOString();

  const vat = data.grand * project.terms.vatPct / 100;
  const total = data.grand + vat;

  return (
    <>
      <div className={`${styles.toolbar} no-print`}>
        <div>
          <div className={styles.toolbarTitle}>ТКП {proposalId}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Срок действия {project.terms.validityDays} дней · {client?.shortName ?? '—'}
          </div>
        </div>
        <div className={styles.toolbarActions}>
          <Link href={`/projects/${project.id}`} style={{ display: 'inline-flex' }}>
            <Button variant="ghost" leftIcon={<IconArrowLeft />}>К проекту</Button>
          </Link>
          <Button variant="secondary" leftIcon={<IconMail />} onClick={() => setEmailOpen(true)}>
            Отправить
          </Button>
          <Button variant="secondary" leftIcon={<IconExcel />} onClick={() => exportProposalXlsx(project, client, allStandards)}>
            Скачать Excel
          </Button>
          <Button leftIcon={<IconPrint />} onClick={() => window.print()}>
            Скачать PDF
          </Button>
        </div>
      </div>

      <div className={styles.a4}>
        <header className={styles.docHeader}>
          <div>
            <div className={styles.brandBig}>{company.shortName}</div>
            <div className={styles.brandSmall}>{company.fullName}</div>
            <div className={styles.brandContacts}>
              ИНН {company.inn} / КПП {company.kpp}<br />
              {company.legalAddress}<br />
              {company.phone && <>тел.: {company.phone}<br /></>}
              {company.email && <>email: {company.email}<br /></>}
              {company.website && <>{company.website}</>}
            </div>
          </div>
          <div className={styles.docNumber}>
            <div className={styles.docTitle}>Технико-коммерческое предложение</div>
            <div className={styles.docId}>№ {proposalId}</div>
            <div className={styles.docDate}>от {formatDateLong(today)}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 8 }}>
              Действительно до{' '}
              {formatDateLong(new Date(Date.now() + project.terms.validityDays * 86400000).toISOString())}
            </div>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Стороны</div>
          <div className={styles.parties}>
            <div className={styles.party}>
              <div className={styles.partyName}>Поставщик</div>
              <div className={styles.partyMeta}>
                {company.shortName}<br />
                ИНН {company.inn} / КПП {company.kpp}<br />
                {company.legalAddress}
              </div>
            </div>
            <div className={styles.party}>
              <div className={styles.partyName}>Заказчик</div>
              <div className={styles.partyMeta}>
                {client?.shortName ?? '—'}<br />
                {client && <>ИНН {client.inn}{client.kpp ? ` / КПП ${client.kpp}` : ''}<br /></>}
                {client?.legalAddress}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Объект</div>
          <div style={{ fontSize: 13 }}>
            <strong>{project.object.name}</strong>
            {project.object.region && <span style={{ color: '#475569' }}>, {project.object.region}</span>}
            {project.object.address && <span style={{ color: '#475569' }}>, {project.object.address}</span>}
            {project.object.projectCode && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#64748B' }}>Код проекта: {project.object.projectCode}</div>
            )}
          </div>
        </section>

        {data.systems.map(({ system, bom, totalCost, computed }) => {
          let Q: number | undefined;
          let H: number | undefined;
          if (system.type === 'KNS') { Q = system.data.Qmax; H = system.data.headRequired; }
          if (system.type === 'FIRE') { Q = system.data.Q; H = system.data.H; }
          if (system.type === 'VNS') { Q = system.data.Qmax; H = system.data.H; }
          const pump = computed?.selectedPumpSku ? findPumpBySku(computed.selectedPumpSku) : undefined;
          return (
            <div key={system.id} className={styles.systemBlock}>
              <div className={styles.systemHeader}>
                <span className={styles.systemTitle}>{system.name}</span>
                <span className={styles.systemBadge}>{systemTypeLabel(system.type)}</span>
              </div>
              <div className={styles.specRow}>
                {Q !== undefined && <span>Q = <strong>{Q} м³/ч</strong></span>}
                {H !== undefined && <span>H = <strong>{H} м</strong></span>}
                {computed?.totalPower !== undefined && <span>P = <strong>{computed.totalPower.toFixed(1)} кВт</strong></span>}
                {pump && <span>Бренд: <strong>{pump.brand}</strong></span>}
              </div>
              <div className={styles.schemaBox} dangerouslySetInnerHTML={{ __html: inlineSchemaSvg(system) }} />
              <div className="no-print">
                <OverridesBanner projectId={project.id} system={system} />
              </div>
              <table className={styles.bomTable}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>№</th>
                    <th style={{ width: 110 }}>Артикул</th>
                    <th>Наименование</th>
                    <th style={{ width: 130 }}>Комментарий</th>
                    <th className={styles.alignRight} style={{ width: 70 }}>Цена</th>
                    <th className={styles.alignCenter} style={{ width: 38 }}>Кол.</th>
                    <th className={styles.alignRight} style={{ width: 80 }}>Стоимость</th>
                    <th className={styles.alignRight} style={{ width: 50 }}>Скид.</th>
                    <th className={styles.alignRight} style={{ width: 90 }}>Закупка</th>
                    <th className={`no-print ${styles.alignCenter}`} style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((b) => (
                    <tr key={b.id}>
                      <td>{b.position}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>{b.article ?? ''}</td>
                      <td>{b.name}</td>
                      <td style={{ fontSize: 10, color: '#64748B' }}>{b.comment ?? ''}</td>
                      <td className={styles.alignRight}>{formatRub(b.unitPrice, { withSign: false, decimals: 0 })}</td>
                      <td className={styles.alignCenter}>{b.quantity}</td>
                      <td className={styles.alignRight}>{formatRub(b.amount, { withSign: false, decimals: 0 })}</td>
                      <td className={styles.alignRight}>{b.discountPct}%</td>
                      <td className={styles.alignRight}><strong>{formatRub(b.purchaseCost, { withSign: false, decimals: 0 })}</strong></td>
                      <td className={`no-print ${styles.alignCenter}`}>
                        <BomReplaceButton projectId={project.id} system={system} bomItem={b} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.systemSum}>Σ по системе: {formatRub(totalCost, { decimals: 0 })}</div>
            </div>
          );
        })}

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Закупка по всем системам</span>
            <span>{formatRub(data.grand, { decimals: 0 })}</span>
          </div>
          <div className={styles.totalRow}>
            <span>НДС {project.terms.vatPct}%</span>
            <span>{formatRub(vat, { decimals: 0 })}</span>
          </div>
          <div className={`${styles.totalRow} ${styles.grand}`}>
            <span>ИТОГО к оплате</span>
            <span>{formatRub(total, { decimals: 0 })}</span>
          </div>
        </div>

        <section className={styles.section} style={{ marginTop: 32 }}>
          <div className={styles.sectionTitle}>Условия поставки</div>
          <dl className={styles.terms}>
            <dt>Срок поставки</dt>
            <dd>{project.terms.leadTimeWeeks} нед. с момента подписания</dd>
            <dt>Базис</dt>
            <dd>{project.terms.basis}</dd>
            <dt>Аванс</dt>
            <dd>{project.terms.prepaymentPct}%</dd>
            <dt>Гарантия</dt>
            <dd>{project.terms.warrantyMonths} мес.</dd>
            <dt>Срок действия ТКП</dt>
            <dd>{project.terms.validityDays} дн.</dd>
            <dt>Валюта</dt>
            <dd>
              {project.terms.currency}
              {project.terms.usdRate && project.terms.currency === 'USD' && ` (курс ${project.terms.usdRate} ₽)`}
            </dd>
          </dl>
        </section>

        {relevantStandards.length > 0 && (
          <section className={styles.section} style={{ marginTop: 24 }}>
            <div className={styles.sectionTitle}>Расчёт выполнен в соответствии с</div>
            <ul className={styles.standardsList}>
              {relevantStandards.map((std) => (
                <li key={std.id}>
                  <span className={styles.standardCode}>{std.code}</span>
                  <span className={styles.standardTitle}>— {std.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.signature}>
          <div className={styles.sigBlock}>
            <div style={{ color: '#64748B', fontSize: 11 }}>Поставщик</div>
            <div style={{ marginTop: 6 }}>{company.directorPositionGenitive ? `От имени` : ''} {company.shortName}</div>
            <div className={styles.sigLine}>{company.director}</div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>М.П.</div>
            <div className={styles.stampPlaceholder}>Место<br />печати</div>
          </div>
          <div className={styles.sigBlock}>
            <div style={{ color: '#64748B', fontSize: 11 }}>Заказчик</div>
            <div style={{ marginTop: 6 }}>{client?.shortName ?? '—'}</div>
            <div className={styles.sigLine}>__________________________</div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>М.П.</div>
          </div>
        </section>
      </div>

      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Отправить ТКП по email"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Отмена</Button>
            <Button
              leftIcon={<IconMail />}
              onClick={() => {
                setEmailOpen(false);
                toast.success('Письмо отправлено', emailValue);
              }}
            >
              Отправить
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Email получателя" type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} placeholder="client@example.com" />
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            К письму будет приложен xlsx с детализацией и PDF-версия ТКП.
          </div>
        </div>
      </Modal>
    </>
  );
}
