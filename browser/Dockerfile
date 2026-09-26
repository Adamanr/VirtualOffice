# Shared headless browser for office computers. Context: browser/
FROM docker.io/library/node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium pulseaudio pulseaudio-utils \
       fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium NODE_ENV=production XDG_RUNTIME_DIR=/tmp/runtime-node EXTENSIONS_DIR=/data/extensions
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY entrypoint.sh ./
# Office-wide browser extensions live on a volume (see docker-compose.yml).
RUN mkdir -p /data/extensions && chown node:node /data/extensions
# Chromium runs without its own sandbox inside the container, so drop root.
USER node
CMD ["sh", "/app/entrypoint.sh"]
