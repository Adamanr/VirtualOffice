# Builds the static client and serves it with Caddy. Context: repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

FROM caddy:2-alpine
COPY --from=build /app/client/dist /srv
