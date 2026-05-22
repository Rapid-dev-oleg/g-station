// Общие переиспользуемые типы

export type ISODate = string;
export type Currency = 'RUB' | 'USD';
export type Brand = 'Wellmix' | 'WILO' | 'CNP' | 'Grundfos' | 'АРЕОПАГ' | 'СЕТУНЬ ИНЖИНИРИНГ' | 'Хоббит' | 'Овен';

export type LegalForm = 'OOO' | 'AO' | 'PAO' | 'ZAO' | 'IP' | 'BUDG' | 'OTHER';

export type Contact = {
  id: string;
  fullName: string;
  position?: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'representative';
  representativeOrg?: string;
};

export type BankAccount = {
  bik: string;
  account: string;
  corrAccount: string;
  bankName: string;
};

export type Address = string;
