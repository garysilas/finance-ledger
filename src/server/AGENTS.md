# Server

## Overview

This area owns private settings, the database connection check, and safe diagnostics. Root project rules also apply. It does not contain financial tables or provider integrations yet.

## Key files

1. `env.ts` validates settings and returns only the application database URL or a safe failure.
2. `status.ts` checks settings before probing and adds a fresh UTC timestamp.
3. `db/pool.ts` owns the shared process pool.
4. `db/probe.ts` runs `SELECT 1` through Drizzle and handles deadlines and resource cleanup.
5. `diagnostics.ts` defines fixed outcome codes and safe database events.

## Conventions

1. Import `server-only` in every runtime module. Keep database clients, credentials, and raw exceptions out of browser imports and service results.
2. Validate settings with Zod. Database and role names follow the identifier rule in `env.ts`. Bootstrap and application logins and passwords must differ. The decoded URL credentials must match the application settings.
3. Accept only `postgresql:` URLs at `127.0.0.1:5432`, with the configured database name and no query options or fragment. Never use bootstrap credentials in the application pool.
4. Reuse one pool across development reloads. Keep its maximum at five connections and use finite acquisition limits.
5. Keep the whole probe within 3000 milliseconds. Distinguish acquisition timeout from query timeout. Release a client that arrives after acquisition expires. Discard a connection whose query exceeds the deadline. Late completion must never become success.
6. Return fixed outcome codes and allowlisted display messages rather than raw error text. Database diagnostic fields are only `event`, `outcome`, and `durationMs`. Measure elapsed time with a monotonic clock.
7. Test failures through injected dependencies, not public request parameters or runtime bypasses. Cover late acquisition, late query completion, resource cleanup, and later recovery.

## Gotchas

The pool retains its first connection settings for the process lifetime. Restart the app after changing settings. Database initialization in `db/init/` runs only on an empty volume. Changing an environment password does not change an existing database role. Never delete the named volume to resolve this mismatch.

The current validator requires `POSTGRES_PASSWORD` at runtime, even though spec 0001 says the bootstrap password is needed only for database operations. Treat that difference as an open issue, not permission to loosen validation during unrelated work.

## Related specs

[Spec 0001](../../docs/specs/0001-architecture-runnable-scaffold/index.md) defines configuration, database limits, failure behavior, and security boundaries.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
