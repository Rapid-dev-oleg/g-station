# Деплой g-station

Приложение = Next.js + **Kimi CLI агент** (расчёт станции по скилу
`pump-station-calc`, парсинг сканов ТЗ через vision). Всё в одном Docker-образе.

## Состав образа

- Node 20 — Next.js приложение (порт 3007);
- Python 3 + `uv` + `kimi-cli` — агентный расчёт по скилам;
- `poppler-utils` (pdftoppm/pdftotext) + `unzip` — извлечение картинок из
  PDF/DOCX для vision-парсинга сканов.

## Что нужно на хосте

1. Docker + docker compose.
2. Репозиторий **gidrostroy** рядом (по умолчанию `../gidrostroy`) — в нём
   живут скилы `.claude/skills/*` и база знаний `KNOWLEDGE/`. Монтируется
   в контейнер как `/workspace` (read-only). Путь переопределяется
   переменной `KIMI_WORKSPACE_HOST`.
3. Переменные окружения (`.env` рядом с docker-compose.yml):
   ```
   NEXTAUTH_SECRET=<случайная строка>
   NEXTAUTH_URL=https://<домен>
   MOONSHOT_API_KEY=sk-kimi-...   # опционально: дефолт, если не задан в Настройках
   KIMI_WORKSPACE_HOST=../gidrostroy
   ```

## Запуск

```bash
docker compose up -d --build      # поднять db + app
docker compose exec app npx prisma db push   # создать схему (первый раз)
docker compose exec app npx prisma db seed   # сид: admin, типы, правила
```

Открыть `http://localhost:3007/login` → `admin@gidrostroy.local` / `admin123`.

## Ключ Kimi

Берётся в порядке приоритета:
1. **Настройки приложения** (`/settings` → «Ключ Kimi API») — хранится в БД,
   меняется без пересборки;
2. переменная окружения `MOONSHOT_API_KEY`.

Endpoint по умолчанию `https://api.kimi.com/coding/v1` (переопределяется
`KIMI_BASE_URL`). Модель `kimi-for-coding`.

## Скилы

Kimi CLI находит скилы в (по приоритету):
- `/workspace/.claude/skills/*` — **project skills** (наш `pump-station-calc`);
- `~/.claude/skills`, `~/.config/agents/skills` — user skills;
- `KIMI_EXTRA_SKILLS_DIRS` (через `:`) — доп. директории, прокидываются
  в `extra_skills_dirs`.

**Подключить дополнительный скил:** положить его папку (`<skill>/SKILL.md`)
в `gidrostroy/.claude/skills/` — он автоматически станет доступен агенту,
либо смонтировать ещё один volume и указать его в `KIMI_EXTRA_SKILLS_DIRS`.

**Применить конкретный скил:** передаётся параметром `skill` в `runKimiAgent`
(подставляется директива «Используй skill `<name>`» в начало промпта).

## Обновление методики без пересборки

Скилы и KNOWLEDGE смонтированы из `gidrostroy` как volume — правки в
методике/правилах подхватываются агентом на следующем запросе, пересборка
образа не нужна. Пересборка нужна только при изменении кода приложения.
