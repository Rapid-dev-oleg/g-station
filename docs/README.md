# Документация — конфигуратор водных систем «Гидрострой-НН»

Этот документ — точка входа в проектную документацию.

## Структура

- `development/changelog.md` — журнал изменений
- `reports/YYYY-MM-DD.md` — ежедневные отчёты по работе над проектом

## Стек

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Zustand 5 + persist (localStorage)
- react-hook-form 7 + zod
- xlsx (экспорт ТКП)
- CSS Modules (без Tailwind)

## Запуск

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:3007
npm run typecheck  # tsc --noEmit
npx tsx scripts/verify-archive.ts  # должен показать 10/10
```

## Ключевые модули

- `src/lib/types/` — типы (Client / Project / SystemConfig / Catalog)
- `src/lib/catalog/` — SKU-каталог (pumps, panels, vfds, collectors, accessories)
- `src/lib/calc/` — расчётный движок и подбор оборудования
- `src/lib/mock/` — моки клиентов / проектов (10 эталонных систем)
- `src/lib/store/` — Zustand-сторы (clients, projects, settings, toast)
- `src/lib/ai/` — мок-парсер ТЗ и мок-генератор схем
- `src/components/ui/` — UI-кит на CSS Modules
- `src/components/wizard/` — пошаговый wizard для KNS/FIRE/VNS
- `src/components/proposal/` — печатная страница ТКП + xlsx-экспорт
- `src/app/` — App Router (страницы)

## Демо-сценарий

1. `/` — дашборд с KPI и последними проектами
2. `/projects/proj-dorogobuzh` — карточка проекта Дорогобуж (2 пожарные станции)
3. Открыть `sys-fire-552` → wizard → шаг «Подбор» → кнопка «Рассчитать» → насос NBW 65-40-250-11.0/2-G, ШУФ-223-11к, Σ 482 227 ₽
4. `/projects/proj-dorogobuzh/proposal` — печатная форма ТКП с экспортом в Excel и PDF (через print)
5. Загрузка файла с именем «КНС…» в drop-zone → AI-анимация → wizard с предзаполненными полями
