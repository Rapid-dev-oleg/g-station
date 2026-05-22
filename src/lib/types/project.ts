import type { ISODate, Currency } from './common';
import type { SystemConfig } from './system';

export type ProjectStatus = 'draft' | 'in_progress' | 'ready' | 'sent' | 'won' | 'lost';

export type ObjectInfo = {
  name: string;            // ПАО «Дорогобуж». Цех АКВМ
  region?: string;
  address?: string;
  projectCode?: string;    // 74757-05/552
};

export type DeliveryTerms = {
  leadTimeWeeks: number;
  vatPct: number;
  prepaymentPct: number;
  warrantyMonths: number;
  basis: 'EXW' | 'FCA' | 'DAP' | 'CIP';
  validityDays: number;
  currency: Currency;
  usdRate?: number;
};

export type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  clientId: string;
  primaryContactId?: string;
  object: ObjectInfo;
  terms: DeliveryTerms;
  systems: SystemConfig[];
  createdAt: ISODate;
  updatedAt: ISODate;
};
