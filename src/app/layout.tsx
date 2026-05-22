import type { Metadata } from 'next';
import { Shell } from '@/components/layout/Shell';
import { StoreHydration } from '@/lib/store/StoreHydration';
import './globals.css';

export const metadata: Metadata = {
  title: 'Гидрострой-НН · Конфигуратор',
  description: 'Конфигуратор водных систем: КНС, пожаротушение, ВНС',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <StoreHydration />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
