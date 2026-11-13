-- Provision the migration role for the financial data foundation.
-- Run as the bootstrap role. Required psql vars (quoted literals):
--   migration_user, migration_password, app_user, bootstrap_user, db_name
-- Safe to rerun: an existing migration role is kept with its password unchanged.

\set ON_ERROR_STOP on

SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = :'migration_user') AS preexisting \gset

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'migration_user', :'migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migration_user') \gexec

\if :preexisting
\echo 'migration role already exists; password left unchanged'
\endif

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'migration_user') \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', :'db_name', :'migration_user') \gexec

-- Let the bootstrap role temporarily assume the migration role so the schema
-- and its default privileges are owned by the migration role.
SELECT format('GRANT %I TO %I', :'migration_user', :'bootstrap_user') \gexec
SELECT format('SET ROLE %I', :'migration_user') \gexec

CREATE SCHEMA IF NOT EXISTS ledger;
REVOKE ALL ON SCHEMA ledger FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA ledger TO %I', :'app_user') \gexec

-- New tables created later by the migration role keep granting the
-- application role data access only, never DELETE and never schema rights.
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA ledger GRANT SELECT, INSERT, UPDATE ON TABLES TO %I', :'app_user') \gexec

RESET ROLE;
SELECT format('REVOKE %I FROM %I', :'migration_user', :'bootstrap_user') \gexec
