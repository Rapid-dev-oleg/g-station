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

**Важно: авторизация агента идёт по OAuth, а не по `api_key`.** Провайдер
`managed:kimi-code` берёт токен из `~/.kimi/credentials/kimi-code.json`
(результат `kimi login`); `api_key` в конфиге обязателен по схеме, но при
наличии oauth-блока игнорируется. Поэтому на сервере эти креды монтируются
в контейнер томом `KIMI_HOME_HOST` (по умолчанию `../kimi-home/.kimi` →
на проде `/opt/kimi-home/.kimi`). Каталог **записываемый** — CLI сам обновляет
`access_token` по `refresh_token`. Без этого файла агент падает с `401`.
Обновить креды: заменить `/opt/kimi-home/.kimi/credentials/kimi-code.json`
на сервере (перезапуск не нужен, CLI читает файл на каждом запуске).

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

## Автодеплой (push в master → пересборка на сервере)

Настроен GitHub Actions: `.github/workflows/deploy.yml`. На каждый `git push`
в `master` (или запуск вручную во вкладке **Actions**) GitHub заходит на сервер
по SSH и выполняет `scripts/server-deploy.sh` (`git reset --hard origin/master`
+ `docker compose up -d --build`). Схему БД накатывает сам `docker-entrypoint.sh`.

**Прод-сервер:** `root@87.199.208.244:22`, проект в `/opt/g-station`, методика
в `/opt/gidrostroy` (`../gidrostroy` относительно compose). Приложение —
`http://87.199.208.244:3007`. Логин по умолчанию: `admin@gidrostroy.local` /
`admin123` (сменить после первого входа).

**Секреты GitHub** (Settings → Secrets and variables → Actions): `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY` (приватный ключ,
чей публичный лежит в `~/.ssh/authorized_keys` сервера).

**Доступ сервера к приватному репозиторию:** на сервере сгенерирован ключ
`~/.ssh/id_ed25519`, его публичная часть добавлена в репозиторий как read-only
**deploy key** — поэтому `git fetch` на сервере работает без токенов.

**Ручной передеплой без пуша:** во вкладке Actions → Deploy → «Run workflow»,
либо на сервере `cd /opt/g-station && bash scripts/server-deploy.sh`.

## Обновление методики без пересборки

Скилы и KNOWLEDGE смонтированы из `gidrostroy` как volume — правки в
методике/правилах подхватываются агентом на следующем запросе, пересборка
образа не нужна. Пересборка нужна только при изменении кода приложения.
