#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "[X] .env 파일이 없습니다." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
mkdir -p backups
chmod 700 backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="backups/krsms-${stamp}.sql.gz"
umask 077
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -9 > "$file"
chmod 600 "$file"
# API configuration is stored in an encrypted file in the named app volume.
if docker compose exec -T app sh -c 'test -f /data/api-config.enc.json' >/dev/null 2>&1; then
  docker compose cp app:/data/api-config.enc.json "${file%.sql.gz}.api-config.enc.json" >/dev/null
  chmod 600 "${file%.sql.gz}.api-config.enc.json"
fi
echo "[OK] 데이터베이스 백업 완료: $file"
echo "[i] 암호화 API 설정 파일이 있으면 같은 이름으로 함께 백업했습니다."
find backups -type f -name 'krsms-*.sql.gz' -mtime +14 -delete
echo "[i] 14일이 지난 로컬 백업은 정리했습니다. 별도 위치에도 암호화 백업을 보관하세요."
