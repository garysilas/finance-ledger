# Ledger

A local, single owner personal finance app. This repository currently
contains the runnable scaffold: one status page that proves the browser to
server to database path, with Postgres 18 running in Docker.

## Requirements

- Node 24 LTS (for example `brew install node@24`, then put
  `/opt/homebrew/opt/node@24/bin` first in PATH).
- pnpm 12 (via `corepack enable` under Node 24).
- Docker Desktop or another Docker engine with Compose.

Pinned toolchain (all versions exact, chosen per spec 0001):

- Node 24.22.2, pnpm 12.17.0
- Next.js 16.4.3, React 19.3.0, Tailwind CSS 4.3.3, TypeScript 5.9.3
- drizzle-orm 0.45.4, pg 8.23.1, zod 4.6.7, server-only 0.0.1
- Vitest 5.0.5, Playwright 1.64.1 (Chromium)
- Postgres image `postgres:18` (PostgreSQL 18.6) at digest
  `sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42`

## First time setup

1. Copy the example settings and fill in real values:

   ```sh
   cp .env.example .env.local
   chmod 600 .env.local
   ```

   Generate two distinct random passwords, for example
   `openssl rand -hex 24`. Set `POSTGRES_PASSWORD` and
   `LEDGER_DB_PASSWORD` to different values. If a password contains
   characters like `@`, `:`, `/`, or `%`, percent encode them inside
   `DATABASE_URL` (for example `%40` for `@`). The decoded username and
   password in `DATABASE_URL` must equal `LEDGER_DB_USER` and
   `LEDGER_DB_PASSWORD` exactly, and its database name must equal
   `POSTGRES_DB`.

2. Install dependencies and start the database:

   ```sh
   pnpm install
   pnpm db:up
   ```

   The database role `LEDGER_DB_USER` is created only on first
   initialisation of an empty data volume, with LOGIN and CONNECT only.

3. Run the app:

   ```sh
   pnpm dev
   ```

   Open http://127.0.0.1:3000. The page reports database status and the
   time of the last check; "Check again" runs a fresh check.

4. Production check:

   ```sh
   pnpm build && pnpm start
   ```

## Everyday commands

- `pnpm dev` development server on http://127.0.0.1:3000
- `pnpm build` / `pnpm start` production build and server
- `pnpm typecheck` strict TypeScript check
- `pnpm db:up` / `pnpm db:down` start and stop Postgres
- `pnpm test` Vitest suite, `pnpm test:e2e` Playwright suite

## Troubleshooting

- **"Cannot connect to the local database."** Check Docker is running and
  `docker compose ps` shows `ledger-postgres` up. A stopped database does
  not break the page; start it and use "Check again".
- **Port 5432 already in use.** Another Postgres (Homebrew, Postgres.app,
  another container) is bound to 127.0.0.1:5432. Stop that service, or
  remove its auto start, then `pnpm db:up` again.
- **"Database sign in failed."** The credentials in `DATABASE_URL` do not
  match the role in the database. This happens when `LEDGER_DB_PASSWORD`
  changed after the first initialisation: Postgres keeps the original
  role password. Either restore the original password in `.env.local`, or
  update the role password with `psql` using the bootstrap login. Do not
  delete the `ledger-pgdata` volume as a fix.
- **"Local database settings need attention."** A value in `.env.local`
  is missing or malformed: identifiers must match
  `^[a-z][a-z0-9_]{0,62}$`, the two logins and the two passwords must
  differ, and `DATABASE_URL` must be exactly
  `postgresql://<user>:<password>@127.0.0.1:5432/<POSTGRES_DB>` with no
  query options.
- **Bad Host or origin errors in the browser.** Use exactly
  http://127.0.0.1:3000, not `localhost`, an alias, or another port.

## Boundaries

`.env.local` is git ignored and stays owner read only. The app never
exposes database credentials to the browser; only a fixed set of status
messages is shown. There is no telemetry. Do not open network bindings,
disable database authentication, or delete the data volume to work around
a failure.
