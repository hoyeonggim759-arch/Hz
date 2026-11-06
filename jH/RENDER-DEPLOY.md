# JinqSMS on Render (free preview)

This repository is configured for a Render Blueprint with two Node web services (Next.js and NestJS) and one Render Postgres database, all in Singapore.

## Important free-tier limitations

- Free web services sleep after 15 minutes without inbound traffic; the first request after sleep can take about a minute to wake up.
- Free web services use ephemeral filesystems. Do not save uploads or persistent data on the service filesystem.
- Free Render Postgres is limited to 1 GB and expires 30 days after creation. It has no free backups. Treat this as a temporary test database, not the long-term production database. Export your data and move/upgrade the database before expiry.
- Free services do not support pre-deploy commands or shell access. This Blueprint runs Prisma migrations and an idempotent create-only admin bootstrap in the API start command.

## Deploy

1. Push this repository to a GitHub repository. Keep `.env`, secrets, dumps, and local backups out of Git.
2. In Render, choose **New + → Blueprint**, connect the repository, and select `render.yaml`.
3. Review the three resources: `jinqsms-api`, `jinqsms-web`, and `jinqsms-db`. Keep both web services and the database in Singapore.
4. During Blueprint creation, enter `ADMIN_LOGIN_ID` (4-32 letters/numbers/underscore/hyphen) and `ADMIN_PASSWORD` (14-128 characters). Use a new, unique password. Render generates `SESSION_SECRET`, `LICENSE_PEPPER`, and `APP_DATA_KEY`.
5. Deploy. The API build generates Prisma Client and compiles NestJS. At startup it applies committed migrations, creates the initial admin only if that ID does not already exist, and starts the API. The web build includes a same-origin `/api` URL; Next.js proxies it to the API service so the browser session cookie stays on the web origin.
6. Open the `jinqsms-web` service URL. Check `https://<API-URL>/api/health` in a browser or use the Render API service health status. Then test registration with an unused license, logout/login, and admin access.

## Environment/security notes

- `DATABASE_URL` and `MIGRATION_DATABASE_URL` both point to the Render private connection string in this free preview. For a hardened production deployment, create separate database runtime and migration roles and use the least-privilege runtime role for `DATABASE_URL`.
- The database is configured with an empty public IP allow list so it is reachable through Render's private networking, not the public internet.
- `API_ORIGIN` and `APP_ORIGIN` are wired from Render-assigned service URLs; do not hardcode temporary hostnames.
- Keep the generated `APP_DATA_KEY` permanently. Losing or rotating it makes encrypted support/task fields unreadable.
- The first admin bootstrap is create-only. If the ID already belongs to a non-admin account, startup intentionally fails rather than silently promoting it.
- `npm run db:deploy` is safe to repeat for committed Prisma migrations; do not use `db:migrate` in production.
- The in-memory API rate limiter is per process and suitable only for this single-instance test setup. Before a public production launch, use shared rate limiting/WAF, configure database least privilege, set up backups, and complete security testing.

## Deploy commands (configured in render.yaml)

API build: `npm install --include=dev && npm run db:generate && npm run build:api`

API start: `npm run db:deploy && node scripts/bootstrap-admin.cjs && npm run start:api`

Web build: `npm install --include=dev && npm run build:web`

Web start: `npm run start:web`
