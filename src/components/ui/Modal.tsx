'use client';

import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
  closeOnOverlay?: boolean;
}

export function Modal({ open, onClose, title, subtitle, size = 'md', footer, children, closeOnOverlay = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={clsx(styles.modal, size === 'lg' && styles.sizeLg, size === 'xl' && styles.sizeXl)}>
        {(title || subtitle) && (
          <div className={styles.header}>
            <div>
              {title && <div className={styles.title}>{title}</div>}
              {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
