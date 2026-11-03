#!/bin/sh
# Container entrypoint. Cloud disks are often mounted owned by root, so fix the
# data folder's ownership, then drop to the unprivileged "node" user to run Maverick.
set -e
DATA_DIR="${MAVERICK_DATA_DIR:-/data/pglite}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$(dirname "$DATA_DIR")"
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi
cd /app/apps/web
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
