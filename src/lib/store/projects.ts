'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MOCK_PROJECTS } from '@/lib/mock/projects';
import { compute } from '@/lib/calc';
import type { Project, SystemConfig, SystemOverrides } from '@/lib/types';

type ProjectsState = {
  projects: Project[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  addProject: (p: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;
  findById: (id: string) => Project | undefined;
  findByClientId: (clientId: string) => Project[];
  addSystem: (projectId: string, system: SystemConfig) => void;
  updateSystem: (projectId: string, systemId: string, patch: Partial<SystemConfig>) => void;
  removeSystem: (projectId: string, systemId: string) => void;
  /**
   * Установить/снять ручную замену (override) для одной позиции системы.
   * После записи запускает compute() и обновляет BOM/итог.
   * value === undefined снимает override этого поля.
   */
  setSystemOverride: (
    projectId: string,
    systemId: string,
    key: keyof SystemOverrides,
    value: string | undefined
  ) => void;
  /** Сбросить все ручные замены системы и пересчитать. */
  clearSystemOverrides: (projectId: string, systemId: string) => void;
};

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: MOCK_PROJECTS,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? ({ ...p, ...patch, updatedAt: new Date().toISOString() } as Project) : p
          ),
        })),
      removeProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      findById: (id) => get().projects.find((p) => p.id === id),
      findByClientId: (clientId) => get().projects.filter((p) => p.clientId === clientId),
      addSystem: (projectId, system) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, systems: [...p.systems, system], updatedAt: new Date().toISOString() }
              : p
          ),
        })),
      updateSystem: (projectId, systemId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  systems: p.systems.map((sys) =>
                    sys.id === systemId
                      ? ({ ...sys, ...patch, updatedAt: new Date().toISOString() } as SystemConfig)
                      : sys
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),
      removeSystem: (projectId, systemId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  systems: p.systems.filter((sys) => sys.id !== systemId),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),
      setSystemOverride: (projectId, systemId, key, value) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              systems: p.systems.map((sys) => {
                if (sys.id !== systemId) return sys;
                // Поддерживаем только строковые override-поля; массивы/extraItems
                // меняются другими экшенами.
                const stringKeys: ReadonlyArray<keyof SystemOverrides> = [
                  'pumpSku', 'panelSku', 'vfdSku', 'collectorSku', 'blockBoxSku',
                ];
                if (!stringKeys.includes(key)) return sys;
                const prev = sys.overrides ?? {};
                const nextOverrides: SystemOverrides = { ...prev, [key]: value };
                // Чистим undefined-поля, чтобы persist не хранил мусор
                if (value === undefined) delete (nextOverrides as Record<string, unknown>)[key as string];
                const candidate: SystemConfig = {
                  ...sys,
                  overrides: nextOverrides,
                  updatedAt: new Date().toISOString(),
                } as SystemConfig;
                try {
                  const r = compute(candidate);
                  return { ...candidate, computed: r.computed, bom: r.bom, totalCost: r.totalCost };
                } catch {
                  return candidate;
                }
              }),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),
      clearSystemOverrides: (projectId, systemId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              systems: p.systems.map((sys) => {
                if (sys.id !== systemId) return sys;
                const candidate: SystemConfig = {
                  ...sys,
                  overrides: undefined,
                  updatedAt: new Date().toISOString(),
                } as SystemConfig;
                try {
                  const r = compute(candidate);
                  return { ...candidate, computed: r.computed, bom: r.bom, totalCost: r.totalCost };
                } catch {
                  return candidate;
                }
              }),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),
    }),
    {
      name: 'vodomer:projects',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
