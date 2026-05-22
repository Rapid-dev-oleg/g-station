import type { Address, BankAccount, Contact, ISODate, LegalForm } from './common';

export type ClientTag = 'промышленное' | 'жилищное' | 'муниципальное' | 'коммерческое' | 'лид';

export type Client = {
  id: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  shortName: string;
  fullName: string;
  legalForm: LegalForm;
  legalAddress: Address;
  postAddress?: Address;
  bankAccount?: BankAccount;
  contacts: Contact[];
  tags?: ClientTag[];
  note?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
};
