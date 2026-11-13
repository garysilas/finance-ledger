#!/bin/sh
# Provision the migration role on an existing data volume. Safe to rerun;
# an existing migration role keeps its password. Reads .env.local, runs the
# shared provisioning SQL inside the ledger-postgres container as the
# bootstrap role.
set -eu

if [ ! -f .env.local ]; then
  echo "provision: .env.local is required" >&2
  exit 1
fi

set -a
. ./.env.local
set +a

for var in POSTGRES_USER POSTGRES_DB LEDGER_DB_USER LEDGER_MIGRATION_USER LEDGER_MIGRATION_PASSWORD; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "provision: $var is required in .env.local" >&2
    exit 1
  fi
done

docker exec -i ledger-postgres psql -v ON_ERROR_STOP=1 \
  -v migration_user="$LEDGER_MIGRATION_USER" \
  -v migration_password="$LEDGER_MIGRATION_PASSWORD" \
  -v app_user="$LEDGER_DB_USER" \
  -v bootstrap_user="$POSTGRES_USER" \
  -v db_name="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /ledger-provision/migration-role.sql
