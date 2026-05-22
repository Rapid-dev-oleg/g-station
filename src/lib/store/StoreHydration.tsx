'use client';

import { useEffect } from 'react';
import { useClientsStore } from './clients';
import { useProjectsStore } from './projects';
import { useSettingsStore } from './settings';
import { useStandardsStore } from './standards';

/**
 * Гидратирует все persist-сторы из localStorage после монтирования на клиенте.
 * Все сторы созданы с `skipHydration: true`, чтобы SSR/CSR начальный рендер совпадал;
 * этот компонент догружает реальное состояние после mount.
 *
 * Вставляется один раз в корневой layout.
 */
export function StoreHydration() {
  useEffect(() => {
    useClientsStore.persist.rehydrate();
    useProjectsStore.persist.rehydrate();
    useSettingsStore.persist.rehydrate();
    useStandardsStore.persist.rehydrate();
  }, []);

  return null;
}
