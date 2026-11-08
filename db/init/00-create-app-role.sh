#!/bin/sh
# Runs once, only when the data volume is empty, inside the official
# postgres image entrypoint. Creates the restricted application login.
# Identifiers and the password are quoted by format(), never interpolated.
set -eu

if [ -z "${LEDGER_DB_USER:-}" ] || [ -z "${LEDGER_DB_PASSWORD:-}" ]; then
  echo "ledger init: LEDGER_DB_USER and LEDGER_DB_PASSWORD are required" >&2
  exit 1
fi

if [ "$LEDGER_DB_USER" = "$POSTGRES_USER" ]; then
  echo "ledger init: LEDGER_DB_USER must differ from POSTGRES_USER" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  -v app_user="$LEDGER_DB_USER" \
  -v app_password="$LEDGER_DB_PASSWORD" \
  -v app_db="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L',
  :'app_user', :'app_password'
) \gexec
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO %I',
  :'app_db', :'app_user'
) \gexec
SELECT format(
  'REVOKE CREATE ON SCHEMA public FROM %I',
  :'app_user'
) \gexec
SQL
