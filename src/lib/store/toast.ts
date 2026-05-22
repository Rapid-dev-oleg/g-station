'use client';

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
};

type ToastState = {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4000);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push({ variant: 'success', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ variant: 'error', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ variant: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ variant: 'warning', title, message }),
};
