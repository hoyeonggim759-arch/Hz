#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"
if [ ! -w "$DATA_DIR" ]; then
  echo "[KRSMS] DATA_DIR=$DATA_DIR is not writable by UID $(id -u). Set the persistent volume owner to UID/GID 1000:1000." >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[KRSMS] Applying database schema..."
  node db/migrate.js
fi

# Optional one-time administrator bootstrap for GitHub-based VPS platforms.
# Enable it only for the first deployment, then remove the three bootstrap
# environment variables and redeploy.
if [ "${BOOTSTRAP_ADMIN_ON_START:-false}" = "true" ]; then
  echo "[KRSMS] Running one-time administrator bootstrap..."
  node scripts/bootstrap-admin.js
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node server.js
