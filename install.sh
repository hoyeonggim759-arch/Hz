#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

if [[ $EUID -ne 0 ]]; then
  echo "이 설치 스크립트는 root 권한이 필요합니다. sudo ./install.sh 로 실행하세요."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[1/6] Docker 설치 중..."
  apt-get update
  apt-get install -y docker.io docker-compose-v2 openssl curl
  systemctl enable --now docker
else
  echo "[1/6] Docker가 이미 설치되어 있습니다."
fi
systemctl enable --now docker >/dev/null 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2가 필요합니다. Ubuntu 패키지 docker-compose-v2를 설치해 주세요."
  exit 1
fi

if [[ -f .env ]]; then
  echo "[!] 기존 .env 파일이 있습니다. 안전을 위해 덮어쓰지 않습니다."
  echo "기존 설정으로 서비스를 시작합니다."
  docker compose up -d --build
  echo "[OK] 기존 KRSMS 서비스를 시작했습니다."
else
  echo "[2/6] 도메인 및 관리자 정보 설정"
  read -r -p "서비스 도메인 (예: sms.example.com): " domain
  if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then echo "도메인 형식이 올바르지 않습니다."; exit 1; fi
  read -r -p "초기 관리자 ID (4~32자): " admin_id
  if [[ ! "$admin_id" =~ ^[A-Za-z0-9_-]{4,32}$ ]]; then echo "관리자 ID 형식이 올바르지 않습니다."; exit 1; fi
  read -r -s -p "초기 관리자 비밀번호 (14자 이상): " admin_password; echo
  if (( ${#admin_password} < 14 )); then echo "비밀번호는 14자 이상이어야 합니다."; exit 1; fi
  pg_password="$(openssl rand -hex 32)"
  session_secret="$(openssl rand -base64 48 | tr -d '\n')"
  license_pepper="$(openssl rand -base64 48 | tr -d '\n')"
  app_data_key="$(openssl rand -hex 32)"
  api_config_key="$(openssl rand -hex 32)"
  cat > .env <<ENV
DOMAIN=${domain}
PUBLIC_ORIGIN=https://${domain}
POSTGRES_DB=krsms
POSTGRES_USER=krsms_app
POSTGRES_PASSWORD=${pg_password}
DATABASE_URL=postgres://krsms_app:${pg_password}@db:5432/krsms
SESSION_SECRET=${session_secret}
LICENSE_PEPPER=${license_pepper}
APP_DATA_KEY=${app_data_key}
API_CONFIG_KEY=${api_config_key}
DATA_DIR=/data
COOKIE_SECURE=true
PORT=3000
TRUST_PROXY_HOPS=1
ENV
  chmod 600 .env
  unset pg_password session_secret license_pepper app_data_key api_config_key
  echo "[3/6] Docker 이미지 빌드"
  docker compose build app
  echo "[4/6] PostgreSQL 시작 및 스키마 준비"
  docker compose up -d db
  for i in $(seq 1 40); do
    if docker compose exec -T db pg_isready -U krsms_app -d krsms >/dev/null 2>&1; then break; fi
    sleep 2
  done
  docker compose run --rm -e SKIP_MIGRATIONS=true app node db/migrate.js
  echo "[5/6] 초기 관리자 생성"
  ADMIN_LOGIN_ID="$admin_id" ADMIN_PASSWORD="$admin_password" docker compose run --rm -e SKIP_MIGRATIONS=true -e ADMIN_LOGIN_ID -e ADMIN_PASSWORD app node scripts/bootstrap-admin.js
  unset admin_password
  echo "[6/6] KRSMS 시작"
  docker compose up -d
fi

echo
echo "============================================"
echo "KRSMS가 시작되었습니다."
echo "URL: https://$(grep '^DOMAIN=' .env | cut -d= -f2-)"
echo "관리자 ID: ${admin_id:-기존 설치 계정}"
echo "상태: docker compose ps"
echo "로그: docker compose logs -f app caddy"
echo "백업: ./scripts/backup-postgres.sh"
echo "============================================"
echo "DNS A 레코드가 이 VPS의 IP를 가리켜야 Caddy가 HTTPS 인증서를 발급할 수 있습니다."
