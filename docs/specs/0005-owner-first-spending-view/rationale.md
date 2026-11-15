# 0005 rationale: owner to first spending view

## Context

Ledger has a financial foundation (spec 0003) with exact money, atomic imports, encrypted token storage, and monthly spending reads, plus a themed shell (spec 0004). Nothing yet proves the real path: there is no sign in, no Plaid connection, and no financial screen. Feature 5 is the walking skeleton that threads owner authentication, one Sandbox connection, one page of real transactions, and a stored spending view.

The forces: a single local owner on loopback, so heavyweight auth is wasted but a usable sign in is still required by scope. Plaid Sandbox only. Spec 0003 explicitly deferred owner auth, the real provider adapter, category mapping, and exact decimal ingestion to this feature, and deferred pagination and webhooks to feature 6. Tracer Bullet ordering applies: prove the thin path through every layer before thickening.

## Options considered

### Option 1: Roll our own auth, official Plaid clients (chosen)

A scrypt password hash on the singleton owner row, a `session` table holding opaque hashed tokens, server actions that revalidate the session, the `plaid` npm client on the server, and `react-plaid-link` in the browser. One sync page is imported at connect time.

**Pros**:

- Smallest surface that fits a one owner local app; no auth framework to learn or misconfigure.
- Reuses spec 0003 services unchanged; the adapter is a thin normalizer, not new domain logic.
- Official Plaid libraries carry typed responses and Sandbox support.

**Cons**:

- Session lifecycle correctness (expiry sliding, revocation, timing safe checks) is our responsibility and needs careful review.
- Password reset or a second factor would be new work if ever wanted.

### Option 2: Auth library (better-auth or Auth.js)

Use a self hosted auth library for sign in and sessions.

**Pros**:

- Battle tested session handling, future support for more methods.

**Cons**:

- Heavy for one passworded owner; adds schema, configuration, and upgrade surface far beyond the need. Auth.js is oriented to OAuth providers, which this app will never have.

### Option 3: Plaid primary categories as display labels

Skip a mapping table and show Plaid's own primary category names.

**Pros**:

- Almost no mapping maintenance.

**Cons**:

- Plaid groupings (for example FOOD_AND_DRINK) do not match the seeded owner categories, weakening budgets later and making totals less explainable.

### Option 4: Full history sync at connect

Paginate `/transactions/sync` until `has_more` is false during connect.

**Pros**:

- The first view would show complete history immediately.

**Cons**:

- Duplicates the retry, cursor, and webhook protocol work that feature 6 owns; a partial implementation here would be written twice and could pretend completeness it does not have.

## Rationale

Reuse beats sprawl: the foundation already supplies every financial guarantee this feature needs, so the new code is auth plumbing and a narrow adapter, not new domain logic. Rolling our own session is justified only because the scope is one owner on loopback; on any multi user or public deployment a proven auth library would be the right call, and this reasoning does not transfer.

One sync page is the honest slice: it exercises the exchange, encryption, batch, cursor, and spending read without borrowing feature 6's hardest problems. The `history_complete` flag makes the limitation visible in the UI instead of implied.

Scrypt via Node crypto avoids a native dependency while staying memory hard; argon2 was the runner up and is the first upgrade if password strength ever matters beyond local use. An in memory throttle is enough because reaching the sign in form already requires local network access.
