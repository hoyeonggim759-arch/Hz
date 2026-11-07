# KRSMS VPS Edition

한국어 사용자 페이지와 관리자 전용 페이지를 제공하는 단일 VPS용 Docker Compose 프로젝트입니다. Next.js/NestJS에 의존하지 않고 Node.js + Express + PostgreSQL로 실행되므로 설치 구성이 단순합니다.

## 포함 기능

- 별도 사용자 페이지(`/`)와 관리자 페이지(`/admin`)
- 한국어 UI, 다크/라이트 테마, 접이식 사이드바
- 회원가입/로그인, bcrypt 비밀번호 해시, HttpOnly 세션 쿠키
- 서버에서 ADMIN 역할을 확인하는 관리자 API
- 라이선스 발급/등록/취소 및 DB 만료 시각 기반 카운트다운
- 사용자 목록, 상세 조회, 가입 IP/최근 로그인 IP, 회원 정지
- IP 차단/해제
- 공지사항 등록 및 사용자 화면 상단 티커
- 클릭 시 열리는 고객센터 채팅, 관리자 답변은 `상담원`으로 표시
- API 설정 메타데이터와 헤더를 AES-256-GCM 암호화 JSON 파일(`/data/api-config.enc.json`)에 저장
- 감사 로그
- PostgreSQL 데이터 볼륨 및 백업/복원 스크립트
- Caddy 자동 HTTPS

## 설치 전 준비

1. Ubuntu 22.04/24.04 VPS 권장 (메모리 2GB 이상, 4GB 권장)
2. 도메인의 A 레코드를 VPS 공인 IPv4 주소로 설정
3. VPS 방화벽에서 22(SSH, 가능하면 본인 IP만), 80, 443만 외부 허용
4. PostgreSQL 5432와 앱 3000 포트는 공개하지 마세요. Compose에서 호스트 포트로 게시하지 않습니다.

## 설치

프로젝트를 VPS에 업로드하거나 `git clone` 후:

```bash
cd KRSMS-VPS
sudo ./install.sh
```

스크립트가 Docker 설치, `.env` 생성, 무작위 키 생성, PostgreSQL 초기화, 최초 관리자 생성, 컨테이너 시작을 수행합니다.

DNS가 아직 전파되지 않았다면 앱과 DB는 시작하더라도 Caddy가 인증서를 발급하지 못할 수 있습니다. DNS를 확인한 뒤:

```bash
docker compose restart caddy
docker compose logs -f caddy
```

## 운영 명령

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f caddy
docker compose restart app
docker compose pull
docker compose up -d --build
./scripts/backup-postgres.sh
```

복원은 기존 DB를 덮어씁니다. 먼저 별도 백업을 만들고 실행하세요:

```bash
./scripts/restore-postgres.sh backups/krsms-YYYYMMDDTHHMMSSZ.sql.gz
```

## 관리자

최초 설치 때 입력한 관리자 ID/비밀번호로 `/admin`에 로그인합니다. 초기 관리자 생성 스크립트는 기존 ADMIN 계정이 있을 경우 비밀번호를 덮어쓰지 않습니다.

수동으로 관리자 추가하려면:

```bash
ADMIN_LOGIN_ID=youradmin ADMIN_PASSWORD='a-long-password-14-chars-or-more' docker compose run --rm -e SKIP_MIGRATIONS=true -e ADMIN_LOGIN_ID -e ADMIN_PASSWORD app node scripts/bootstrap-admin.js
```

## 작업 플러그인 파일과 실행 의미

`worker/task-plugin.example.js`는 서버 측 확장 계약 예시입니다. 현재 기본 설치는 휴대전화 번호와 분 단위의 작업 시간을 DB에 기록하고 종료 예정 시각을 관리하지만, 외부 문자 발송이나 임의 API 호출은 실행하지 않습니다. 즉, 플러그인이 비활성화되어 있으면 실제 외부 작업은 아무것도 실행되지 않습니다.

이 패키지는 임의의 코드를 웹 화면에서 업로드해 실행하는 원격 코드 실행 기능을 포함하지 않습니다. 전화번호 대상의 반복 SMS/인증코드 발송 또는 무제한 API 재시도 엔진도 포함하지 않습니다. 승인된 본인 인증/내부 업무를 연결하려면 검토된 provider 어댑터를 별도로 구현하고, 본인 동의, 발송 제한, 쿨다운, 중지 제어를 유지해야 합니다. 사용자 입력의 `durationMinutes`는 작업 유효 시간/기한입니다.

## 보안 사항

- `.env`에는 DB 비밀번호, 세션 비밀키, 라이선스 HMAC 키 및 암호화 키가 포함됩니다. 공유하거나 Git에 올리지 마세요.
- `APP_DATA_KEY` 및 `API_CONFIG_KEY`를 바꾸면 해당 키로 암호화한 기존 데이터/설정을 복호화할 수 없습니다. 반드시 오프라인 백업을 유지하세요.
- API 설정은 암호화 파일로 저장되며 비밀 헤더는 API로 다시 반환하지 않습니다. 이 기능은 설정 저장 기능이며 임의 대상에 API를 실행하는 기능은 아닙니다.
- 로그인 세션은 HttpOnly 쿠키, SameSite=Lax, Secure(기본 true)로 설정됩니다.
- 관리자 권한은 서버가 매 요청마다 확인합니다.
- IP 차단, 로그인 제한, 입력 검증, 감사 로그가 기본 제공됩니다.
- 로컬 백업만으로는 VPS 장애/침해를 복구할 수 없습니다. 암호화한 오프사이트 백업도 유지하세요.

## 현재 범위의 제한

이것은 독립 VPS 스타터 앱입니다. 기존 Render DB의 사용자/카密 데이터를 자동으로 가져오지 않습니다. Render에서 완전 이전하려면 기존 DB를 별도 백업하고 스키마 호환성을 확인한 뒤 데이터 마이그레이션을 해야 합니다. 먼저 테스트 VPS에서 검증한 뒤 실사용으로 전환하세요.
