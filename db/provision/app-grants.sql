-- Apply application role grants on the ledger schema after migrations.
-- Run as the migration role. Required psql var (quoted literal): app_user.
-- Financial records allow SELECT, INSERT, UPDATE and never DELETE.
-- Audit and receipt records allow SELECT and INSERT and are never mutable.
-- Immutable metadata tables are listed explicitly; add future ones here.

\set ON_ERROR_STOP on

SELECT format('GRANT USAGE ON SCHEMA ledger TO %I', :'app_user') \gexec

SELECT format('GRANT SELECT, INSERT ON ledger.%I TO %I', tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'ledger'
  AND tablename IN ('audit', 'request_receipt') \gexec

SELECT format('REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER ON ledger.%I FROM %I', tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'ledger'
  AND tablename IN ('audit', 'request_receipt') \gexec

SELECT format('GRANT SELECT, INSERT, UPDATE ON ledger.%I TO %I', tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'ledger'
  AND tablename NOT IN ('audit', 'request_receipt') \gexec

SELECT format('REVOKE DELETE, TRUNCATE, TRIGGER ON ledger.%I FROM %I', tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'ledger'
  AND tablename NOT IN ('audit', 'request_receipt') \gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA ledger GRANT SELECT, INSERT, UPDATE ON TABLES TO %I',
  :'app_user'
) \gexec
