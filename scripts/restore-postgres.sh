#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "사용법: $0 backups/krsms-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 1
fi
[[ -f .env ]] || { echo "[X] .env 파일이 없습니다." >&2; exit 1; }
set -a; . ./.env; set +a
read -r -p "주의: 현재 데이터베이스를 백업 파일로 덮어씁니다. 계속하시겠습니까? (yes 입력): " answer
[[ "$answer" == "yes" ]] || { echo "취소했습니다."; exit 0; }
gzip -dc "$1" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[OK] 복원 명령이 완료되었습니다."
