'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { SkuPicker, toast } from '@/components/ui';
import {
  findAlternativePumps,
  findAlternativePanels,
  findAlternativeVfds,
  findAlternativeCollectors,
  findAlternativeBlockBoxes,
  type Alternative,
} from '@/lib/calc';
import { useProjectsStore } from '@/lib/store';
import { findPumpBySku } from '@/lib/catalog/pumps';
import type {
  BomItem, SystemConfig, SystemOverrides,
  PumpSku, PanelSku, VfdSku, CollectorSku, BlockBoxSku,
} from '@/lib/types';
import styles from './BomReplaceButton.module.css';

export type ReplaceKind = 'pump' | 'panel' | 'vfd' | 'collector' | 'blockbox';

export interface BomReplaceButtonProps {
  projectId: string;
  system: SystemConfig;
  bomItem: BomItem;
  size?: 'sm' | 'md';
  /** Скрывать ли кнопку при печати (по умолчанию да). */
  hideOnPrint?: boolean;
  className?: string;
}

/** Маппинг BomItem.group → kind + ключ overrides + label */
function detectReplaceKind(group: BomItem['group']): {
  kind: ReplaceKind;
  overrideKey: keyof SystemOverrides;
  title: string;
} | null {
  switch (group) {
    case 'pump':    return { kind: 'pump',     overrideKey: 'pumpSku',     title: 'Заменить насос' };
    case 'panel':   return { kind: 'panel',    overrideKey: 'panelSku',    title: 'Заменить шкаф управления' };
    case 'vfd':     return { kind: 'vfd',      overrideKey: 'vfdSku',      title: 'Заменить ЧРП' };
    case 'collector': return { kind: 'collector', overrideKey: 'collectorSku', title: 'Заменить коллектор' };
    case 'blockbox': return { kind: 'blockbox', overrideKey: 'blockBoxSku', title: 'Заменить блок-бокс' };
    default: return null;
  }
}

/** Извлечь Q/H/medium из system.data для фильтра альтернатив насоса. */
function getHydraulics(system: SystemConfig): { Q: number; H: number; medium?: string } {
  if (system.type === 'KNS') {
    return { Q: system.data.Qmax, H: system.data.headRequired, medium: system.data.medium };
  }
  if (system.type === 'FIRE') {
    return { Q: system.data.Q, H: system.data.H, medium: system.data.medium };
  }
  return { Q: system.data.Qmax, H: system.data.H, medium: system.data.medium };
}

/** Решение: какой kind вообще можно заменить для этой системы и строки BOM. */
export function canReplaceBomItem(system: SystemConfig, item: BomItem): boolean {
  const detect = detectReplaceKind(item.group);
  if (!detect) return false;

  // У VNS-систем с panelIncludedInPump / vfdInsteadOfPanel — ШУ не существует и/или не подменяем
  if (system.type === 'VNS') {
    const d = system.data;
    if (detect.kind === 'panel' && (d.panelIncludedInPump || d.vfdInsteadOfPanel)) {
      return false;
    }
  }
  return true;
}

export function BomReplaceButton({
  projectId,
  system,
  bomItem,
  size = 'sm',
  className,
}: BomReplaceButtonProps) {
  const setSystemOverride = useProjectsStore((s) => s.setSystemOverride);
  const [open, setOpen] = useState(false);

  const detect = useMemo(() => detectReplaceKind(bomItem.group), [bomItem.group]);
  const canShow = useMemo(() => canReplaceBomItem(system, bomItem), [system, bomItem]);

  if (!detect || !canShow) return null;

  return (
    <>
      <button
        type="button"
        className={clsx(styles.btn, size === 'md' && styles.btnLg, className)}
        title={detect.title}
        aria-label={detect.title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>

      <ReplacePicker
        kind={detect.kind}
        title={detect.title}
        isOpen={open}
        onClose={() => setOpen(false)}
        system={system}
        currentSku={bomItem.article}
        onPick={(sku) => {
          setSystemOverride(projectId, system.id, detect.overrideKey, sku);
          toast.success('Позиция заменена', 'BOM и итог пересчитаны');
        }}
        onClear={() => {
          setSystemOverride(projectId, system.id, detect.overrideKey, undefined);
          toast.success('Возврат к автоподбору');
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Внутренний компонент: подбирает Alternative<...>[] по типу и рисует SkuPicker */
/* -------------------------------------------------------------------------- */

function ReplacePicker({
  kind, title, isOpen, onClose, system, currentSku, onPick, onClear,
}: {
  kind: ReplaceKind;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  system: SystemConfig;
  currentSku?: string;
  onPick: (sku: string) => void;
  onClear: () => void;
}) {
  // Подсчитываем альтернативы лениво — только когда открыто, чтобы не блокировать рендер.
  const data = useMemo(() => {
    if (!isOpen) return null;
    if (kind === 'pump') {
      const { Q, H, medium } = getHydraulics(system);
      return findAlternativePumps({
        systemType: system.type,
        Q, H,
        medium: medium as any,
        currentSku,
      }) as Alternative<PumpSku>[];
    }
    if (kind === 'panel') {
      const pumpSku = system.computed?.selectedPumpSku;
      // Найдём power текущего насоса через bom (group=pump)
      const pumpItem = (system.bom ?? []).find((b) => b.group === 'pump');
      // Лучше брать из пиковых полей — но мощность от насоса в каталоге
      const pumpPower = estimatePumpPower(system, pumpSku, pumpItem);
      const pumpsCount = totalPumps(system);
      return findAlternativePanels({
        systemType: system.type,
        pumpsCount,
        pumpPower,
        currentSku,
      }) as Alternative<PanelSku>[];
    }
    if (kind === 'vfd') {
      const pumpSku = system.computed?.selectedPumpSku;
      const pumpItem = (system.bom ?? []).find((b) => b.group === 'pump');
      const pumpPower = estimatePumpPower(system, pumpSku, pumpItem);
      return findAlternativeVfds({ pumpPower, currentSku }) as Alternative<VfdSku>[];
    }
    if (kind === 'collector') {
      return findAlternativeCollectors({ currentSku }) as Alternative<CollectorSku>[];
    }
    if (kind === 'blockbox') {
      const pumpSku = system.computed?.selectedPumpSku;
      const pumpItem = (system.bom ?? []).find((b) => b.group === 'pump');
      const pumpPower = estimatePumpPower(system, pumpSku, pumpItem);
      return findAlternativeBlockBoxes({ pumpPower, currentSku }) as Alternative<BlockBoxSku>[];
    }
    return null;
  }, [isOpen, kind, system, currentSku]);

  if (!isOpen) return null;

  if (kind === 'pump') {
    const alts = (data as Alternative<PumpSku>[]) ?? [];
    return (
      <SkuPicker<PumpSku>
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        currentSku={currentSku}
        alternatives={alts}
        onSelect={(s) => onPick(s.sku)}
        onClear={onClear}
        getSkuId={(s) => s.sku}
        getDisplayName={(s) => `${s.brand} ${s.model}`}
        getSubtitle={(s) => s.sku}
        getPrice={(s) => s.unitPriceRub}
      />
    );
  }
  if (kind === 'panel') {
    const alts = (data as Alternative<PanelSku>[]) ?? [];
    return (
      <SkuPicker<PanelSku>
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        currentSku={currentSku}
        alternatives={alts}
        onSelect={(s) => onPick(s.sku)}
        onClear={onClear}
        getSkuId={(s) => s.sku}
        getDisplayName={(s) => s.model}
        getSubtitle={(s) => s.sku}
        getPrice={(s) => s.unitPriceRub}
      />
    );
  }
  if (kind === 'vfd') {
    const alts = (data as Alternative<VfdSku>[]) ?? [];
    return (
      <SkuPicker<VfdSku>
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        currentSku={currentSku}
        alternatives={alts}
        onSelect={(s) => onPick(s.sku)}
        onClear={onClear}
        getSkuId={(s) => s.sku}
        getDisplayName={(s) => `${s.brand} ${s.model}`}
        getSubtitle={(s) => s.sku}
        getPrice={(s) => s.unitPriceRub}
      />
    );
  }
  if (kind === 'collector') {
    const alts = (data as Alternative<CollectorSku>[]) ?? [];
    return (
      <SkuPicker<CollectorSku>
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        currentSku={currentSku}
        alternatives={alts}
        onSelect={(s) => onPick(s.sku)}
        onClear={onClear}
        getSkuId={(s) => s.sku}
        getDisplayName={(s) => s.model}
        getSubtitle={(s) => s.sku}
        getPrice={(s) => s.unitPriceRub}
      />
    );
  }
  if (kind === 'blockbox') {
    const alts = (data as Alternative<BlockBoxSku>[]) ?? [];
    return (
      <SkuPicker<BlockBoxSku>
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        currentSku={currentSku}
        alternatives={alts}
        onSelect={(s) => onPick(s.sku)}
        onClear={onClear}
        getSkuId={(s) => s.sku}
        getDisplayName={(s) => s.model}
        getSubtitle={(s) => s.sku}
        getPrice={(s) => s.unitPriceRub}
      />
    );
  }
  return null;
}

/* -------------------- helpers -------------------- */

function totalPumps(system: SystemConfig): number {
  const d = system.data as any;
  return (d.workingPumps ?? 0) + (d.reservePumps ?? 0);
}

/**
 * Мощность текущего насоса. Сначала пробуем найти насос в каталоге по sku,
 * иначе — оценка из computed.totalPower / количество насосов.
 */
function estimatePumpPower(system: SystemConfig, pumpSku?: string, _pumpItem?: BomItem): number {
  if (pumpSku) {
    const p = findPumpBySku(pumpSku);
    if (p) return p.power;
  }
  const total = system.computed?.totalPower ?? 0;
  const count = totalPumps(system);
  if (count > 0 && total > 0) return total / count;
  return 0;
}

/* ============================================================================ */
/* Баннер «применены ручные замены» — для шапки BOM-таблицы.                    */
/* ============================================================================ */

export interface OverridesBannerProps {
  projectId: string;
  system: SystemConfig;
}

export function OverridesBanner({ projectId, system }: OverridesBannerProps) {
  const clearSystemOverrides = useProjectsStore((s) => s.clearSystemOverrides);
  const o = system.overrides;
  const hasAny =
    !!o &&
    (o.pumpSku || o.panelSku || o.vfdSku || o.collectorSku || o.blockBoxSku ||
      (o.removedAccessories && o.removedAccessories.length) ||
      (o.extraItems && o.extraItems.length));

  if (!hasAny) return null;

  return (
    <div className={styles.overridesBanner}>
      <div className={styles.overridesText}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Применены ручные замены оборудования
      </div>
      <button
        type="button"
        className={styles.overridesReset}
        onClick={() => clearSystemOverrides(projectId, system.id)}
      >
        Сбросить
      </button>
    </div>
  );
}
