#!/bin/sh
# A private sound server for per-tab audio sinks (nothing is played on real hardware).
mkdir -p "$XDG_RUNTIME_DIR"
pulseaudio --daemonize=yes --exit-idle-time=-1 --disallow-exit --disable-shm=true --log-target=stderr \
  || echo "pulseaudio unavailable: shared browser runs without sound"
exec node src/server.mjs
