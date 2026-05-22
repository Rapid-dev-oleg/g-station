'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SEED_STANDARDS, type StandardCard } from '@/lib/standards';

type StandardsState = {
  items: StandardCard[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  addStandard: (s: StandardCard) => void;
  updateStandard: (id: string, patch: Partial<StandardCard>) => void;
  removeStandard: (id: string) => void;
  findById: (id: string) => StandardCard | undefined;
  resetToSeed: () => void;
};

export const useStandardsStore = create<StandardsState>()(
  persist(
    (set, get) => ({
      items: SEED_STANDARDS,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      addStandard: (s) => set((st) => ({ items: [s, ...st.items] })),
      updateStandard: (id, patch) =>
        set((st) => ({
          items: st.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeStandard: (id) =>
        set((st) => ({ items: st.items.filter((x) => x.id !== id) })),
      findById: (id) => get().items.find((x) => x.id === id),
      resetToSeed: () => set({ items: SEED_STANDARDS }),
    }),
    {
      name: 'vodomer:standards',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
