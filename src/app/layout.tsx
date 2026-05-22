import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'G-Station — расчёт пожарных насосных станций',
  description: 'Инструмент инженера «Гидрострой-НН»',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
