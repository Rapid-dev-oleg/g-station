/**
 * Документ ТКП — печатная вёрстка формата A4.
 *
 * Server component: получает уже собранную модель `ProposalData` и
 * реквизиты. Данные системы — из расчётных дел (Dossier). По дизайну
 * прототипа rusgidrostroy/proposal.
 */

import { formatRub } from '@/lib/format';
import type { ProposalData } from './proposalData';
import styles from './Proposal.module.css';

/** Реквизиты поставщика (из Settings). */
export interface CompanyInfo {
  name: string;
  inn?: string;
  address?: string;
  phone?: string;
  email?: string;
}

/** Реквизиты заказчика (из Client). */
export interface ClientInfo {
  name: string;
  inn?: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

export interface ProposalProps {
  proposalId: string;
  date: string;
  objectName: string;
  company: CompanyInfo;
  client: ClientInfo;
  data: ProposalData;
  norms: string[];
}

const DASH = '—';

export function Proposal({
  proposalId,
  date,
  objectName,
  company,
  client,
  data,
  norms,
}: ProposalProps) {
  return (
    <div className={styles.a4}>
      {/* ── Шапка документа ── */}
      <header className={styles.docHeader}>
        <div>
          <div className={styles.brandBig}>{company.name}</div>
          <div className={styles.brandContacts}>
            {company.inn && (
              <>
                ИНН {company.inn}
                <br />
              </>
            )}
            {company.address && (
              <>
                {company.address}
                <br />
              </>
            )}
            {company.phone && (
              <>
                тел.: {company.phone}
                <br />
              </>
            )}
            {company.email && <>email: {company.email}</>}
          </div>
        </div>
        <div className={styles.docNumber}>
          <div className={styles.docTitle}>
            Технико-коммерческое предложение
          </div>
          <div className={styles.docId}>№ {proposalId}</div>
          <div className={styles.docDate}>от {date}</div>
        </div>
      </header>

      {/* ── Стороны ── */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Стороны</div>
        <div className={styles.parties}>
          <div className={styles.party}>
            <div className={styles.partyName}>Поставщик</div>
            <div className={styles.partyMeta}>
              {company.name}
              <br />
              {company.inn && (
                <>
                  ИНН {company.inn}
                  <br />
                </>
              )}
              {company.address}
            </div>
          </div>
          <div className={styles.party}>
            <div className={styles.partyName}>Заказчик</div>
            <div className={styles.partyMeta}>
              {client.name}
              <br />
              {client.inn && (
                <>
                  ИНН {client.inn}
                  <br />
                </>
              )}
              {client.contactName && <>{client.contactName}</>}
            </div>
          </div>
        </div>
      </section>

      {/* ── Объект ── */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Объект</div>
        <div className={styles.objectLine}>
          <strong>{objectName}</strong>
        </div>
      </section>

      {/* ── Перечень систем ── */}
      {data.systems.map((sys) => (
        <div key={sys.id} className={styles.systemBlock}>
          <div className={styles.systemHeader}>
            <span className={styles.systemTitle}>{sys.name}</span>
            <span className={styles.systemBadge}>{sys.typeName}</span>
          </div>

          {sys.productCode && (
            <div className={styles.systemCode}>Шифр: {sys.productCode}</div>
          )}

          <div className={styles.specRow}>
            {sys.Q != null && (
              <span>
                Q = <strong>{sys.Q} м³/ч</strong>
              </span>
            )}
            {sys.H != null && (
              <span>
                H = <strong>{sys.H} м</strong>
              </span>
            )}
            {sys.power != null && (
              <span>
                P = <strong>{sys.power} кВт</strong>
              </span>
            )}
            {sys.scheme && (
              <span>
                Схема: <strong>{sys.scheme}</strong>
              </span>
            )}
            {sys.pumpBrand && (
              <span>
                Насос:{' '}
                <strong>
                  {sys.pumpBrand}
                  {sys.pumpModel ? ` ${sys.pumpModel}` : ''}
                  {sys.pumpQty ? ` ×${sys.pumpQty}` : ''}
                </strong>
              </span>
            )}
          </div>

          {sys.pricingMissing ? (
            <div className={styles.emptyPricing}>
              Расчёт не доведён до ценообразования — спецификация и цены
              появятся после шага 4 расчёта.
            </div>
          ) : (
            <>
              <table className={styles.bomTable}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>№</th>
                    <th>Наименование</th>
                    <th style={{ width: 90 }}>Группа</th>
                    <th className={styles.alignRight} style={{ width: 90 }}>
                      Цена
                    </th>
                    <th className={styles.alignCenter} style={{ width: 40 }}>
                      Кол.
                    </th>
                    <th className={styles.alignRight} style={{ width: 56 }}>
                      Скид.
                    </th>
                    <th className={styles.alignRight} style={{ width: 100 }}>
                      Закупка
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sys.rows.map((r) => (
                    <tr key={r.position}>
                      <td>{r.position}</td>
                      <td>
                        {r.name}
                        {r.note && (
                          <span className={styles.groupCell}> — {r.note}</span>
                        )}
                      </td>
                      <td className={styles.groupCell}>{r.group ?? DASH}</td>
                      <td className={styles.alignRight}>
                        {formatRub(r.unitPrice, {
                          withSign: false,
                          decimals: 0,
                        })}{' '}
                        {r.currency}
                      </td>
                      <td className={styles.alignCenter}>{r.qty}</td>
                      <td className={styles.alignRight}>{r.discount}%</td>
                      <td className={styles.alignRight}>
                        <strong>
                          {formatRub(r.cost, {
                            withSign: false,
                            decimals: 0,
                          })}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.systemSum}>
                Σ по системе: {formatRub(sys.total, { decimals: 0 })}
              </div>
            </>
          )}
        </div>
      ))}

      {/* ── Итоги ── */}
      <div className={styles.totals}>
        <div className={`${styles.totalRow} ${styles.grand}`}>
          <span>ИТОГО закупка по всем системам</span>
          <span>{formatRub(data.grandCost, { decimals: 0 })}</span>
        </div>
      </div>

      {/* ── Нормативы ── */}
      {norms.length > 0 && (
        <section className={styles.section} style={{ marginTop: 28 }}>
          <div className={styles.sectionTitle}>
            Расчёт выполнен в соответствии с
          </div>
          <ul className={styles.standardsList}>
            {norms.map((n) => (
              <li key={n}>
                <span className={styles.standardCode}>{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Подписи ── */}
      <section className={styles.signature}>
        <div className={styles.sigBlock}>
          <div className={styles.sigCaption}>Поставщик</div>
          <div className={styles.sigName}>{company.name}</div>
          <div className={styles.sigLine}>__________________________</div>
          <div className={styles.sigMp}>М.П.</div>
        </div>
        <div className={styles.sigBlock}>
          <div className={styles.sigCaption}>Заказчик</div>
          <div className={styles.sigName}>{client.name}</div>
          <div className={styles.sigLine}>__________________________</div>
          <div className={styles.sigMp}>М.П.</div>
        </div>
      </section>
    </div>
  );
}
