# JinqSMS Secure Workspace — local + VPS

A single npm-workspaces repository containing a Next.js web app, NestJS API and PostgreSQL schema. The task area stores user-owned task requests, status and logs. As requested, the actual phone execution integration is intentionally left to you; this repository does not claim to execute phone actions.

## Included

- Registration/login/logout with Argon2id password hashes and HttpOnly session cookies.
- Server-side authentication and admin role checks.
- PostgreSQL persistence with Prisma.
- Membership license generation (admin) and one-time redemption; only an HMAC digest is stored.
- Task creation (1–300 minutes), user-scoped task history, stop requests and task logs.
- Support threads and user messages.
- Admin overview, user suspension/reactivation, license generation and audit events.
- Basic per-process API rate limits and security headers.
- Dockerfiles, Compose, and Caddy reverse-proxy example for VPS deployment.

## Prerequisites

- Node.js 22 or newer and npm 10+.
- Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Linux).

## Local run (Windows PowerShell)

1. Extract the ZIP and open PowerShell in the repository root (the folder containing `package.json`).
2. Copy environment template: `Copy-Item .env.example .env`.
3. Edit `.env`: set `POSTGRES_PASSWORD` (database admin), `APP_DB_USER`, `APP_DB_PASSWORD`, `MIGRATION_DB_USER`, `MIGRATION_DB_PASSWORD`, `DATABASE_URL` (app role), `MIGRATION_DATABASE_URL` (migration role), `SESSION_SECRET` (at least 48 random characters), `LICENSE_PEPPER` (a different random secret of at least 32 characters), `APP_DATA_KEY` (64 hex characters), `ADMIN_LOGIN_ID`, and `ADMIN_PASSWORD` (at least 14 characters). Keep `.env` private. The PostgreSQL init script creates a restricted runtime role and a separate migration role on first volume initialization. On Linux/macOS, generate secrets with `openssl rand -hex 32`; on Windows PowerShell, use `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`.
4. Start only the database: `docker compose -f infra/compose.yaml up -d postgres`.
5. Install dependencies: `npm install`.
6. Generate Prisma client: `npm run db:generate`.
7. Create/update local database schema: `npm run db:migrate -- --name init` (first run) or `npm run db:migrate` (later schema changes).
8. Create the first administrator: `npm run db:seed-admin`.
9. Terminal 1: `npm run dev:api`.
10. Terminal 2: `npm run dev:web`.
11. Open `http://localhost:3000`; API health: `http://localhost:4000/api/health`.

## Local run (Linux/macOS)

Use `cp .env.example .env`, edit secrets as above, then run the same npm and Docker commands from the repository root. Use two terminals for `npm run dev:api` and `npm run dev:web`.

## VPS deployment with Docker Compose

1. Provision an Ubuntu 22.04/24.04 or Debian 12 VPS. Install Docker Engine and the Compose plugin. Configure the VPS firewall to allow SSH and HTTPS (80/443); do not expose PostgreSQL.
2. Upload/extract this repository on the VPS. Copy `.env.example` to `.env` and set strong unique secrets. Set `NODE_ENV=production`, `APP_ORIGIN=https://YOUR_DOMAIN`, and `NEXT_PUBLIC_API_URL=/api` (same-origin reverse proxy). Keep `DATABASE_URL` in `.env` pointing to `localhost` with the restricted `APP_DB_USER`; keep `MIGRATION_DATABASE_URL` pointing to `localhost` with `MIGRATION_DB_USER`. Compose overrides both inside the API container to use the private `postgres` service. The runtime role has DML privileges; schema migrations use the separate migration role.
3. Build: `docker compose -f infra/compose.yaml build`.
4. Start PostgreSQL: `docker compose -f infra/compose.yaml up -d postgres`.
5. Run migrations with the separate migration-only container: `docker compose -f infra/compose.yaml run --rm migrate`.
6. Create the administrator with a short-lived bootstrap container: `docker compose -f infra/compose.yaml run --rm bootstrap`.
7. Start app: `docker compose -f infra/compose.yaml up -d`.
8. Configure Caddy/Nginx to proxy the domain to `127.0.0.1:3000`, routing `/api/*` to `127.0.0.1:4000`. Example: `deploy/Caddyfile.example`. Caddy can obtain and renew HTTPS certificates automatically when DNS and firewall are correct.
9. Confirm `https://YOUR_DOMAIN/api/health`, register a normal account, sign in, and test admin login with the credentials from `.env`.

### VPS environment notes

- Compose binds web and API ports to loopback only. Put a reverse proxy in front; do not expose app ports directly to the internet. The long-running API container receives only its runtime database credential and application secrets; PostgreSQL admin, migration and initial-admin credentials are isolated to the database and one-off operations containers.
- Use a single origin for web and `/api` where possible. If using separate subdomains, set `APP_ORIGIN` to the exact web origin and use HTTPS for both.
- Run `./scripts/backup-postgres.sh` after installing `age` and setting `BACKUP_AGE_RECIPIENT`; copy encrypted backups off-host and test restore procedures.
- Rotate database admin, runtime, and migration credentials deliberately; update both `DATABASE_URL` and `MIGRATION_DATABASE_URL` where applicable.
- The included rate limiter is process-local. For multi-instance production, add a shared Redis-backed limiter/WAF and configure trusted proxy handling carefully.
- Use an external object store for attachments before enabling uploads. No file upload endpoint is enabled in this build.
- Password recovery and payments are intentionally not enabled because secure identity verification and payment provider configuration are not supplied.

## Important task execution boundary

Creating a task writes a `QUEUED` database record. Stopping a task writes `STOP_REQUESTED`. The worker/handler that performs your own authorized phone workflow is not included. Implement and test that adapter separately; have it poll/consume queued tasks, enforce the user's authorization and time limit, update `RUNNING`/terminal status, and append `TaskLog` rows. Never treat a queued record as proof that external execution has started.

## Useful commands

- `npm run build:api` / `npm run build:web`
- `npm run db:generate`
- `npm run db:migrate -- --name change_name` (development migrations)
- `npm run db:deploy` (apply committed migrations in production)
- `npm run db:seed-admin` (local `.env` admin bootstrap)

## Production security work still required

This repository provides an application/deployment baseline, not a claim of “top-tier” security or a completed independent audit. Before public launch, also complete:

- VPS SSH-key hardening, disable remote root login, host firewall, unattended security updates and intrusion alerts.
- Cloudflare DNS/WAF/DDoS setup. To protect the origin, restrict origin 80/443 to Cloudflare's current official IP ranges and audit IPv4/IPv6/DNS history for leaks.
- Admin MFA (not built into this project yet).
- Shared Redis-backed rate limiting for multiple API instances; the included limiter is per-process only.
- Automated off-host backup upload, offline key custody and tested recovery.
- Generate and commit `package-lock.json` after dependency installation; deploy from the lockfile, scan dependencies and run authorization/penetration tests before launch.

A single VPS in the $10–30/month range can be a carefully hardened starting point, but it is not high availability, cross-region disaster recovery, or a substitute for security operations and an independent audit.
