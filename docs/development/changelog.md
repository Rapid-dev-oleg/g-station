# Changelog

## 2026-05-13 — MVP UI

Реализован полный UI слой для демки конфигуратора:

- Глобальные стили, CSS-переменные палитры, шрифт Inter
- UI-кит: Button (4 варианта × 3 размера), Card, Badge, Input, NumberInput, Select, Textarea, Table, Modal, EmptyState, Toast, Tabs, Progress, IconButton, Avatar, Tooltip + inline-SVG-иконки
- Layout: Sidebar (240px, навигация), Header (хлебные крошки, поиск-плейсхолдер, AI-бейдж, аватар), Shell с Toast-контейнером
- Zustand-сторы с persist в localStorage: clients, projects, settings (реквизиты компании), toast
- Дашборд `/` — 4 KPI-карточки, последние проекты, топ-клиенты, CTA-баннер
- `/clients` — список с фильтрами; `/clients/[id]` — карточка с реквизитами/контактами/портфелем; `/clients/new` и `/clients/[id]/edit` — форма (react-hook-form + zod) с табами Реквизиты/Контакты/Банк/Прочее; валидация ИНН + предупреждение о дубликате
- `/projects` — список с фильтрами; `/projects/new` — 3-шаговый мастер (Клиент → Объект → Условия); `/projects/[id]` — карточка с drop-zone для ТЗ, списком систем, CTA добавления, сводкой
- AI-парсинг (`UploadDropzone` + `MockSpecParser`): прогресс-бар, имитация 3,5 сек, по имени файла определяет тип системы и предзаполняет данные
- Wizard `/projects/[id]/systems/[sid]` — 9 шагов (Назначение, Гидравлика, Конструктив, Подключения, Насосы, Автоматика, Комплектация, Подбор, Превью) с поддержкой всех трёх типов KNS/FIRE/VNS, степпером, live-сводкой, авто-сохранением в localStorage каждые 2 сек, баннером «AI заполнил поля» при `?prefilled=true`
- Шаг «Подбор» — спиннер «Подбираем насос…» 1,5 сек → SVG-схема, BOM-таблица, итоговая сумма
- `/projects/[id]/proposal` — печатная форма A4 с шапкой Гидрострой-НН, реквизитами заказчика, BOM по каждой системе, итогом, условиями поставки, подписями; toolbar с экспортом в xlsx (формат архива: №/Артикул/Наименование/Комментарий/Цена/Кол-во/Стоимость/Скидка/Закупка), кнопкой Печать (window.print) и мок-отправкой на email
- `/catalog` — табы по типам SKU (насосы, шкафы, ЧРП, коллекторы, аксессуары, блок-боксы) с фильтрами
- `/standards` — справочник нормативов (10 СП/ГОСТ) с тегами по типу системы
- `/settings/company` — форма реквизитов компании (юр. данные, банк, подписи, лого/печать)
- `src/lib/ai/imagen.ts` — `MockSchemaGenerator` с inline-SVG для KNS/FIRE/VNS + заглушка `NanoBananaGenerator`
- `src/lib/ai/parser.ts` — `MockSpecParser` с шаблонами knsHozbyt/knsLivnevka/fire552/vnsPromyvka + заглушка `OpenRouterSpecParser`
- Forматтер `src/lib/format/index.ts` — formatRub в русской локали (`1 234 567,89 ₽`), форматы дат, лейблы статусов/тегов

Минорные исправления базы:
- `src/lib/types/catalog.ts` — импорт `Medium` перенесён с `./common` на `./system` (исправлен сломанный импорт)
- `src/lib/mock/projects.ts` — добавлено обязательное поле `source: 'reservoir'` в `fire552.data` (требование `FireData`)

После работы:
- `tsc --noEmit` — без ошибок
- `verify-archive.ts` — 10/10 ✓
- все маршруты возвращают 200 на http://localhost:3007

## 2026-05-13 — Ручная замена оборудования (SkuPicker)

Реализована функциональность ручной замены SKU в спецификации (overrides) поверх готовой логики `findAlternatives` + `compute(system.overrides)`.

- `src/components/ui/SkuPicker.tsx` + `.module.css` — универсальный generic-combobox с поиском, бейджами совместимости (exact/compatible/override), ценами и дельтами относительно текущего выбора, навигацией клавиатурой (↑↓ Enter Esc) и блоком текущего выбора с кнопкой «Вернуть автоподбор»
- `src/components/bom/BomReplaceButton.tsx` — кнопка ↻ возле строки BOM. Сама определяет тип picker'а по `bomItem.group` (pump/panel/vfd/collector/blockbox), достаёт Q/H/medium из `system.data`, открывает SkuPicker с подходящими альтернативами и применяет результат через `setSystemOverride`. Скрывается при печати. Для VNS с `panelIncludedInPump` или `vfdInsteadOfPanel` кнопка у ШУ не рендерится
- `src/components/bom/BomReplaceButton.tsx::OverridesBanner` — баннер «Применены ручные замены оборудования» с кнопкой «Сбросить»
- `src/lib/store/projects.ts` — добавлены экшены `setSystemOverride(projectId, systemId, key, value)` и `clearSystemOverrides(projectId, systemId)`; после записи overrides сразу запускают `compute()` и обновляют `bom`/`computed`/`totalCost` в сторе → UI пересчитывается мгновенно
- `src/components/wizard/Wizard.tsx` — кнопки ↻ и баннер overrides в BOM-карточке шага «Подбор» и в шаге «Превью»; `draft` синхронизируется с актуальной системой из стора по `updatedAt`
- `src/components/proposal/Proposal.tsx` — дополнительная no-print колонка с кнопкой ↻ возле каждой строки BOM-таблицы + баннер overrides

После работы:
- `tsc --noEmit` — без ошибок
- `verify-archive.ts` — 10/10 ✓ (overrides не используются по умолчанию, регрессий нет)
