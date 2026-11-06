#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT in .env to an age public recipient}"
command -v age >/dev/null || { echo "age is required on the host" >&2; exit 1; }
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/nova-postgres-${stamp}.sql.age"
docker compose -f infra/compose.yaml exec -T postgres sh -lc 'PGPASSWORD="$APP_DB_PASSWORD" pg_dump --no-owner --no-privileges -U "$APP_DB_USER" "$POSTGRES_DB"' | age -r "$BACKUP_AGE_RECIPIENT" -o "$out"
echo "Encrypted backup created: $out"
echo "Copy this encrypted file off the VPS. Keep the age private identity offline and separate."
