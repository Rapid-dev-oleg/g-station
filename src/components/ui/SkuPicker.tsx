'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { IconSearch } from './Icons';
import { formatRub } from '@/lib/format';
import type { Alternative } from '@/lib/calc';
import styles from './SkuPicker.module.css';

export interface SkuPickerProps<T> {
  /** Заголовок модалки, например «Заменить насос». */
  title: string;
  /** SKU текущего выбора (для подсветки и кнопки «Вернуть автоподбор»). */
  currentSku?: string;
  /** Список альтернатив — уже отранжированный findAlternative*. */
  alternatives: Alternative<T>[];
  /** Открыта ли модалка. */
  isOpen: boolean;
  /** Закрыть без выбора (Esc / клик по фону / крестик). */
  onClose: () => void;
  /** Выбрать конкретный SKU. */
  onSelect: (sku: T) => void;
  /** Сбросить override и вернуться к авто-подбору. Если не задано — кнопка скрыта. */
  onClear?: () => void;

  // Описатели — generic нужен потому, что у Pump/Panel/VFD разные поля.
  getSkuId: (sku: T) => string;
  getDisplayName: (sku: T) => string;
  getSubtitle?: (sku: T) => string;
  getPrice: (sku: T) => number;
}

const COMPAT_BADGE: Record<string, { variant: 'default' | 'success' | 'warning'; label: string }> = {
  exact: { variant: 'default', label: 'текущий' },
  compatible: { variant: 'success', label: 'совместим' },
  override: { variant: 'warning', label: 'требует обоснования' },
  incompatible: { variant: 'warning', label: 'несовместим' },
};

export function SkuPicker<T>({
  title,
  currentSku,
  alternatives,
  isOpen,
  onClose,
  onSelect,
  onClear,
  getSkuId,
  getDisplayName,
  getSubtitle,
  getPrice,
}: SkuPickerProps<T>) {
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Сброс при открытии
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setActiveIdx(0);
      // фокус на инпут после рендера модалки
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Фильтрация по локальному поиску (alternatives уже отсортированы).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return alternatives;
    return alternatives.filter((a) => {
      const name = getDisplayName(a.sku).toLowerCase();
      const id = getSkuId(a.sku).toLowerCase();
      const sub = getSubtitle ? getSubtitle(a.sku).toLowerCase() : '';
      return name.includes(q) || id.includes(q) || sub.includes(q);
    });
  }, [search, alternatives, getDisplayName, getSkuId, getSubtitle]);

  // Гарантируем валидный activeIdx при изменении списка
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  // Текущий выбор для верхнего блока
  const current = useMemo(() => {
    if (!currentSku) return undefined;
    return alternatives.find((a) => getSkuId(a.sku) === currentSku);
  }, [currentSku, alternatives, getSkuId]);

  // Клавиатура: ↑↓ навигация, Enter выбор
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) {
        onSelect(item.sku);
        onClose();
      }
    }
  };

  // Скролл активного элемента в видимую область
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[activeIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="lg">
      <div onKeyDown={onKey} tabIndex={-1}>
        <div className={styles.searchWrap}>
          <IconSearch className={styles.searchIcon} width={16} height={16} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Поиск по модели, артикулу, бренду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {current && (
          <div className={styles.current}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.currentLabel}>Сейчас выбрано</div>
              <div className={styles.currentName}>{getDisplayName(current.sku)}</div>
              {getSubtitle && <div className={styles.currentMeta}>{getSubtitle(current.sku)}</div>}
            </div>
            {onClear && (
              <button type="button" className={styles.clearBtn} onClick={() => { onClear(); onClose(); }}>
                Вернуть автоподбор
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {search.trim()
              ? <>Ничего не найдено по запросу «{search}»</>
              : <>Альтернатив в каталоге нет</>}
          </div>
        ) : (
          <div className={styles.list} ref={listRef}>
            {filtered.map((alt, idx) => {
              const id = getSkuId(alt.sku);
              const isCurrent = currentSku === id;
              const isActive = idx === activeIdx;
              const badge = COMPAT_BADGE[alt.compatibility];
              const price = getPrice(alt.sku);
              const delta = alt.priceDelta;
              return (
                <button
                  key={id}
                  type="button"
                  className={clsx(
                    styles.item,
                    isActive && styles.itemActive,
                    isCurrent && styles.itemCurrent
                  )}
                  onClick={() => {
                    onSelect(alt.sku);
                    onClose();
                  }}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <Badge variant={isCurrent ? 'default' : badge.variant}>
                    {isCurrent ? 'текущий' : badge.label}
                  </Badge>
                  <div className={styles.itemMain}>
                    <div className={styles.itemName}>{getDisplayName(alt.sku)}</div>
                    {getSubtitle && (
                      <div className={styles.itemSubtitle}>{getSubtitle(alt.sku)}</div>
                    )}
                    <div
                      className={clsx(
                        styles.itemReason,
                        alt.compatibility === 'override' && styles.itemReasonWarn
                      )}
                    >
                      {alt.reason}
                    </div>
                  </div>
                  <div className={styles.itemPrice}>
                    <div className={styles.itemPriceValue}>{formatRub(price, { decimals: 0 })}</div>
                    {!isCurrent && delta !== undefined && delta !== 0 && (
                      <div
                        className={clsx(
                          styles.itemPriceDelta,
                          delta > 0 ? styles.deltaPlus : styles.deltaMinus
                        )}
                      >
                        {delta > 0 ? '+' : '−'}
                        {formatRub(Math.abs(delta), { decimals: 0 })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.kbdHint}>
          <span><span className={styles.kbd}>↑↓</span>навигация</span>
          <span><span className={styles.kbd}>Enter</span>выбор</span>
          <span><span className={styles.kbd}>Esc</span>отмена</span>
        </div>
      </div>
    </Modal>
  );
}
