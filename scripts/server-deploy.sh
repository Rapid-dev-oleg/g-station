#!/usr/bin/env bash
# Пересборка и запуск приложения на сервере. Вызывается из .github/workflows/deploy.yml
# ПОСЛЕ обновления кода (git reset --hard origin/master). Можно запускать и вручную:
#   ssh user@server 'cd /opt/g-station && bash scripts/server-deploy.sh'
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ docker compose up -d --build"
docker compose up -d --build

# Схему БД накатывает сам docker-entrypoint.sh при старте контейнера
# (npx prisma db push --skip-generate), поэтому отдельно её здесь не трогаем.

echo "→ статус контейнеров"
docker compose ps

echo "✓ Деплой завершён"
