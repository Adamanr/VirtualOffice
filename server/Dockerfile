# Phoenix release. Build context: repository root (needs /shared for protocol.json
# at compile time and level.json at runtime).
FROM docker.io/library/elixir:1.18-slim AS build
ENV MIX_ENV=prod
# The slim image has no CA bundle: Hex downloads over HTTPS need it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
RUN mix local.hex --force && mix local.rebar --force
COPY server/mix.exs server/mix.lock ./
RUN mix deps.get --only prod && mkdir config
COPY server/config/config.exs server/config/prod.exs config/
RUN mix deps.compile
COPY shared /app/shared
COPY server/lib lib
COPY server/priv priv
COPY server/config/runtime.exs config/
RUN mix compile && mix release

FROM docker.io/library/elixir:1.18-slim
ENV MIX_ENV=prod PHX_SERVER=true LANG=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/server/_build/prod/rel/office ./rel
COPY shared /app/shared
RUN mkdir -p /data/uploads
CMD ["/app/rel/bin/office", "start"]
