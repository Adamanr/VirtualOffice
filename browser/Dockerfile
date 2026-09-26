# Shared headless browser for office computers. Context: browser/
FROM docker.io/library/node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# Chromium runs without its own sandbox inside the container, so drop root.
USER node
CMD ["node", "src/server.mjs"]
