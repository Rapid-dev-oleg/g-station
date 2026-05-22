import type { ReactNode } from 'react';
import { Shell } from '@/components/layout/Shell';

/** Layout приложения — все страницы кроме /login обёрнуты в Shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
