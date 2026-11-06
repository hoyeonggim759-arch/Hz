#!/bin/bash
set -euo pipefail
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${MIGRATION_DB_USER:?MIGRATION_DB_USER is required}"
: "${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv migration_user MIGRATION_DB_USER
\getenv migration_password MIGRATION_DB_PASSWORD
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
CREATE ROLE :"migration_user" LOGIN CREATEDB PASSWORD :'migration_password';
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"migration_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT USAGE ON TYPES TO :"app_user";
EOSQL
