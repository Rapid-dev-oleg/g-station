'use client';

/**
 * Панель действий ТКП (client component): экспорт в Excel и печать в PDF.
 * Данные ТКП передаются уже собранными — компонент только их выгружает.
 */

import Link from 'next/link';
import { Button, IconArrowLeft, IconExcel, IconPrint } from '@/components/ui';
import { exportProposalXlsx, type ExportMeta } from './exportXlsx';
import type { ProposalData } from './proposalData';
import styles from './Proposal.module.css';

export interface ProposalActionsProps {
  projectId: string;
  proposalId: string;
  clientName: string;
  data: ProposalData;
  exportMeta: ExportMeta;
  norms: string[];
}

export function ProposalActions({
  projectId,
  proposalId,
  clientName,
  data,
  exportMeta,
  norms,
}: ProposalActionsProps) {
  return (
    <div className={`${styles.toolbar} no-print`}>
      <div>
        <div className={styles.toolbarTitle}>ТКП {proposalId}</div>
        <div className={styles.toolbarSub}>{clientName}</div>
      </div>
      <div className={styles.toolbarActions}>
        <Link
          href={`/projects/${projectId}`}
          style={{ display: 'inline-flex' }}
        >
          <Button variant="ghost" leftIcon={<IconArrowLeft />}>
            К проекту
          </Button>
        </Link>
        <Button
          variant="secondary"
          leftIcon={<IconExcel />}
          onClick={() => exportProposalXlsx(data, exportMeta, norms)}
        >
          Скачать Excel
        </Button>
        <Button leftIcon={<IconPrint />} onClick={() => window.print()}>
          Печать / PDF
        </Button>
      </div>
    </div>
  );
}
