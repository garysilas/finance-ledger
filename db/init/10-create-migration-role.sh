#!/bin/sh
# Runs once, only when the data volume is empty, inside the official
# postgres image entrypoint. Provisions the dedicated migration role and
# the ledger schema ownership per spec 0003. Identifiers and passwords are
# quoted by format(), never interpolated.
set -eu

for var in LEDGER_MIGRATION_USER LEDGER_MIGRATION_PASSWORD LEDGER_DB_USER; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "ledger init: $var is required" >&2
    exit 1
  fi
done

for name in "$LEDGER_MIGRATION_USER" "$LEDGER_DB_USER"; do
  if [ "$name" = "$POSTGRES_USER" ]; then
    echo "ledger init: $name must differ from POSTGRES_USER" >&2
    exit 1
  fi
done

if [ "$LEDGER_MIGRATION_USER" = "$LEDGER_DB_USER" ]; then
  echo "ledger init: migration and application logins must differ" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  -v migration_user="$LEDGER_MIGRATION_USER" \
  -v migration_password="$LEDGER_MIGRATION_PASSWORD" \
  -v app_user="$LEDGER_DB_USER" \
  -v bootstrap_user="$POSTGRES_USER" \
  -v db_name="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /ledger-provision/migration-role.sql
