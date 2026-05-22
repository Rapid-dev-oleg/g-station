'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CompanySettings = {
  shortName: string;
  fullName: string;
  inn: string;
  kpp: string;
  ogrn?: string;
  legalAddress: string;
  postAddress?: string;
  bank: {
    name: string;
    bik: string;
    account: string;
    corrAccount: string;
  };
  director: string;
  directorPositionGenitive: string;
  basis: string; // основание полномочий (Устав)
  phone?: string;
  email?: string;
  website?: string;
};

export const DEFAULT_COMPANY: CompanySettings = {
  shortName: 'ООО «Гидрострой-НН»',
  fullName: 'Общество с ограниченной ответственностью «Гидрострой-НН»',
  inn: '5262273290',
  kpp: '525901001',
  ogrn: '1115262011478',
  legalAddress: '603081, г. Нижний Новгород, ул. Чаадаева, д. 5Д, 4 этаж, офис П 65',
  postAddress: '603081, г. Нижний Новгород, ул. Чаадаева, д. 5Д, 4 этаж, офис П 65',
  bank: {
    name: 'Волго-Вятский банк ПАО Сбербанк, г. Нижний Новгород',
    bik: '042202603',
    account: '40702810542050007890',
    corrAccount: '30101810900000000603',
  },
  director: 'Кукушкин Е. С.',
  directorPositionGenitive: 'Генерального директора',
  basis: 'Устава',
  phone: '+7 (831) 235-15-15',
  email: 'info@gidrostroy-nn.ru',
  website: 'gidrostroy-nn.ru',
};

type SettingsState = {
  company: CompanySettings;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  updateCompany: (patch: Partial<CompanySettings>) => void;
  resetCompany: () => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      company: DEFAULT_COMPANY,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      updateCompany: (patch) => set((s) => ({ company: { ...s.company, ...patch } })),
      resetCompany: () => set({ company: DEFAULT_COMPANY }),
    }),
    {
      name: 'vodomer:settings',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
