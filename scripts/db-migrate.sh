#!/bin/sh
# Apply ledger migrations as the dedicated migration role, then grant the
# application role its exact table privileges. Migration credentials come
# from the environment (for example a sourced .env.local); they are never
# loaded by the application.
set -eu

: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
: "${LEDGER_DB_USER:?LEDGER_DB_USER is required}"

drizzle-kit migrate

# Prefer a local psql; otherwise run grants inside the Compose Postgres
# container (PSQL_CONTAINER, default ledger-postgres, use
# ledger-test-postgres for the isolated test database).
if command -v psql >/dev/null 2>&1; then
  psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v app_user="$LEDGER_DB_USER" \
    -f db/provision/app-grants.sql
else
  # Inside the container the published port does not apply; connect over
  # the local socket with the migration role and database name.
  : "${POSTGRES_DB:?POSTGRES_DB is required for container grants}"
  : "${LEDGER_MIGRATION_USER:?LEDGER_MIGRATION_USER is required}"
  docker exec -i "${PSQL_CONTAINER:-ledger-postgres}" \
    psql -v ON_ERROR_STOP=1 \
    -v app_user="$LEDGER_DB_USER" \
    --username "$LEDGER_MIGRATION_USER" --dbname "$POSTGRES_DB" \
    -f /ledger-provision/app-grants.sql
fi
