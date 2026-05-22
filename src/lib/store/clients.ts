'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MOCK_CLIENTS } from '@/lib/mock/clients';
import type { Client } from '@/lib/types';

type ClientsState = {
  clients: Client[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  addClient: (c: Client) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  removeClient: (id: string) => void;
  findById: (id: string) => Client | undefined;
  findByInn: (inn: string) => Client | undefined;
};

export const useClientsStore = create<ClientsState>()(
  persist(
    (set, get) => ({
      clients: MOCK_CLIENTS,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      addClient: (c) => set((s) => ({ clients: [c, ...s.clients] })),
      updateClient: (id, patch) =>
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
          ),
        })),
      removeClient: (id) =>
        set((s) => ({ clients: s.clients.filter((c) => c.id !== id) })),
      findById: (id) => get().clients.find((c) => c.id === id),
      findByInn: (inn) => get().clients.find((c) => c.inn === inn),
    }),
    {
      name: 'vodomer:clients',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
