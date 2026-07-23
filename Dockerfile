# g-station: Next.js + Kimi CLI агент (расчёт через скилы) в одном образе.
#
# Включает ВСЕ зависимости рантайма, которые приложение вызывает процессами:
#  - Node 20 (Next.js приложение + MCP-сервер к БД через tsx);
#  - Python 3 + uv + kimi-cli (агентный расчёт/подбор по скилу pump-station-calc,
#    web search/fetch, MCP-инструменты к нашей БД);
#  - poppler-utils (pdftotext/pdftoppm) + unzip — текст/картинки из PDF/DOCX;
#  - antiword + catdoc — чтение старых .doc/.xls (catppt/xls2csv в комплекте).

FROM node:20-bookworm-slim AS base

# Системные инструменты рантайма (см. шапку — все спавнятся приложением).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv curl ca-certificates poppler-utils unzip \
      antiword catdoc \
    && rm -rf /var/lib/apt/lists/*

# uv + kimi-cli (ставится как изолированный tool, бинарь в /root/.local/bin).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv tool install kimi-cli && kimi --version

# Claude Code CLI — РЕЗЕРВНЫЙ агент расчёта (автопереключение при исчерпании квоты
# Kimi). Авторизация — OAuth-подписка Claude Pro/Max (`claude login` на сервере,
# креды в /root/.claude, смонтирован томом). Тот же скил + MCP, что у Kimi.
RUN npm install -g @anthropic-ai/claude-code && claude --version

WORKDIR /app

# Зависимости (react RC ⇒ legacy-peer-deps).
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Исходники + сборка.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
# Путь к рабочей директории агента (скилы + KNOWLEDGE) — ЗАПИСЫВАЕМЫЙ volume,
# засевается из /seed при первом старте (см. docker-entrypoint.sh). Методика
# НЕ запечена в образ — правится из браузера и переживает рестарт.
ENV KIMI_AGENT_WORKSPACE=/workspace
ENV KIMI_BIN=/root/.local/bin/kimi

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3007
# Засев методики в volume + prisma db push + старт.
CMD ["/usr/local/bin/docker-entrypoint.sh"]
