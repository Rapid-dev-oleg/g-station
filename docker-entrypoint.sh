#!/bin/sh
set -e

# Засев методики в ЗАПИСЫВАЕМЫЙ volume при первом старте.
# Методика (скилы + KNOWLEDGE) не запечена в образ — она правится из браузера
# (раздел «Методика») и должна переживать рестарт. Volume /workspace пустой при
# первом запуске — копируем туда содержимое из read-only источника /seed.
if [ -d /seed ] && [ -z "$(ls -A /workspace 2>/dev/null)" ]; then
  echo "[entrypoint] /workspace пуст — засев методики из /seed…"
  cp -a /seed/.claude /workspace/ 2>/dev/null || true
  cp -a /seed/KNOWLEDGE /workspace/ 2>/dev/null || true
  echo "[entrypoint] засев готов: $(ls -A /workspace | tr '\n' ' ')"
else
  echo "[entrypoint] /workspace уже наполнен — засев пропущен (правки сохранены)."
fi

# Схема БД (миграций в проекте нет — синхронизируем через db push).
echo "[entrypoint] prisma db push…"
npx prisma db push --skip-generate

# Витрина инструкций пожарки (перенос методики скила). Идемпотентно: если у
# fire уже есть инструкции — no-op, правки из браузера не затираются.
echo "[entrypoint] наполнение витрины пожарки (идемпотентно)…"
npx tsx scripts/seed-fire-instructions.ts || echo "[entrypoint] seed пожарки пропущен (не критично)"

echo "[entrypoint] старт приложения…"
exec npm run start
