# g-station: Next.js + Kimi CLI агент (расчёт через скилы) в одном образе.
#
# Включает:
#  - Node 20 (Next.js приложение);
#  - Python 3 + uv + kimi-cli (агентный расчёт по скилу pump-station-calc);
#  - poppler-utils (pdftoppm/pdftotext) + unzip (извлечение картинок из PDF/DOCX
#    для vision-парсинга сканов ТЗ).

FROM node:20-bookworm-slim AS base

# Системные инструменты: python (для kimi-cli), poppler, unzip, curl.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv curl ca-certificates poppler-utils unzip \
    && rm -rf /var/lib/apt/lists/*

# uv + kimi-cli (ставится как изолированный tool, бинарь в /root/.local/bin).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv tool install kimi-cli && kimi --version

WORKDIR /app

# Зависимости (react RC ⇒ legacy-peer-deps).
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Исходники + сборка.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
# Путь к рабочей директории агента (скилы + KNOWLEDGE) — монтируется volume.
ENV KIMI_AGENT_WORKSPACE=/workspace
ENV KIMI_BIN=/root/.local/bin/kimi

EXPOSE 3007
CMD ["npm", "run", "start"]
