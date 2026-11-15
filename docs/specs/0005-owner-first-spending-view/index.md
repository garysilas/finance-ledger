# 0005. Owner to first spending view

**Date**: 2026-11-14
**Status**: Accepted

## Summary

Add owner sign in, one Plaid Sandbox connection through Link, and the first real spending screen. The owner signs in with a password set by a command line script, connects one institution, and sees stored monthly totals, category breakdown, and account balances. The access token stays encrypted on the server. History is imported one sync page at a time and the view says honestly that coverage is partial.

## Requirements

As the owner, I want to sign in, connect one Sandbox institution, and see real stored spending so that Ledger proves its full path end to end.

1. **AC-1**: The owner signs in with a password whose hash is set only by an explicit `pnpm` script. Sign in creates a database session and an opaque httpOnly cookie. Sessions slide for 7 days of activity with a 30 day absolute cap. Sign out revokes the session row and clears the cookie.
2. **AC-2**: Unauthenticated requests to `/spending` and other protected routes redirect to the sign in page. Every server action revalidates the session itself. `/status` remains public and free of financial records. Session failure never exposes financial services.
3. **AC-3**: A connect call to action on the empty spending view creates a Plaid link token server side, opens Link through `react-plaid-link`, exchanges the public token, stores the access token through the existing encrypted envelope, and records an active connection with its institution. Closing Link without finishing creates nothing and shows no error.
4. **AC-4**: Right after exchange, the same server flow reads accounts and imports exactly one `/transactions/sync` page through `applyProviderBatch`, commits the cursor, and sets `history_complete` to false. One page never claims complete history.
5. **AC-5**: `/spending` shows the selected month's posted total, category breakdown, and account balances with freshness and a partial history notice. The owner can move to previous months. Empty, loading, and error states exist and stay accessible by keyboard with visible focus.
6. **AC-6**: A checked in mapping table converts Plaid `personal_finance_category` codes and amount signs into the seeded stable category keys and the spec 0003 classifications. Amounts convert exactly to minor units or fail; nothing is rounded.
7. **AC-7**: Plaid credentials live only in private server settings. The access token, link token, cursor, account numbers, and raw provider responses never reach the browser, logs, or diagnostics.
8. **AC-8**: Failures keep committed work. A failed exchange or sync leaves the connection in a safe state with a retry action. Five failed sign ins in a row trigger a growing delay per process. Provider outages surface as a generic failure state with retry, never as raw Plaid errors.

## Decision

**Chosen option**: Roll our own single owner auth (scrypt password hash on the owner row, database backed opaque sessions) plus the official `plaid` server client and `react-plaid-link` for the connect flow, importing one sync page through the existing foundation services.

**Implementation skills**: No community skill informed this decision; skills and MCP discovery for the new tools were declined. Follow installed package documentation during implementation.

This spec governs scope feature 5. Confirmation ratifies content, not shipment. Status follows the feature lifecycle.

## Feature design

### Records and relationships

Use the existing `ledger` schema. One reviewed migration adds:

| Record              | Fields                                                                                                        | Constraints                                                                                                                      |
| :------------------ | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| owner (extend)      | `password_hash` text, nullable                                                                                | Null until the script sets it. Scrypt encoded parameters, salt, and derived key in one string. Sign in is impossible while null. |
| session             | id UUID, owner_id FK, token_hash bytea, created_at, last_seen_at, expires_at, absolute_expires_at, revoked_at | Unique token_hash. Indexed on token_hash and expires_at. Composite owner FK matching existing convention.                        |
| connection (extend) | `history_complete` boolean not null default false                                                             | False until feature 6 completes a full sync protocol run.                                                                        |

The session token itself is a 32 byte random value sent to the browser once in the cookie; only its SHA 256 hash is stored. No Plaid link tokens, public tokens, or webhooks are persisted.

### State transitions

Session: issued (cookie set, row inserted) → active (each authenticated request refreshes `last_seen_at` and slides `expires_at` to now + 7 days, never past `absolute_expires_at`) → expired (either deadline passed; row remains for audit, cookie rejected) or revoked (sign out sets `revoked_at`). Expired and revoked sessions never revive; sign in always mints a new session.

Connection states and transitions remain exactly as spec 0003 (active, needs_reconnect, disconnected). Connect failure mid flow keeps whatever committed; no new states are added.

### API surface

Server Actions and server rendered routes, not REST endpoints. All write actions validate input with Zod and revalidate the session before any service call.

| Surface                          | Kind         | Key inputs                                         | Key outputs                                                              | Auth    | Key errors                                                                  |
| :------------------------------- | :----------- | :------------------------------------------------- | :----------------------------------------------------------------------- | :------ | :-------------------------------------------------------------------------- |
| `/signin` page + `signIn` action | page, action | password (req), optional return path               | session cookie, redirect to return path or `/spending`                   | public  | invalid credentials (generic), throttled                                    |
| `signOut` action                 | action       | none                                               | revoked session, cleared cookie, redirect to `/signin`                   | session | none user facing                                                            |
| `createLinkToken` action         | action       | none                                               | link_token string, fresh per Link open                                   | session | PROVIDER_UNAVAILABLE, CONFIG_INVALID                                        |
| `completeConnection` action      | action       | public_token (req), institution metadata from Link | connection id, sync outcome, or `{stage, connection_id?}` failure        | session | PROVIDER_UNAVAILABLE, KEY_UNAVAILABLE, CONFLICT                             |
| `retryInitialSync` action        | action       | connection id                                      | sync outcome                                                             | session | PROVIDER_UNAVAILABLE, CONFLICT, NOT_FOUND                                   |
| `/spending` route                | page         | `?month=YYYY-MM` (opt)                             | posted total, category totals, account balances, freshness, history flag | session | generic failure; invalid month falls back to current with the error visible |
| `proxy.ts`                       | middleware   | all requests                                       | redirect unsigned requests to `/signin` for protected paths              | n/a     | n/a                                                                         |

`completeConnection` runs exchange, encrypted `createConnection`, institution lookup, and one sync page in order. Each stage that commits stays committed; a failure returns `{stage, connection_id?}` so retry resumes, not restarts. A re-run that hits the `provider_item_id` unique constraint returns the existing connection rather than duplicating it. Because a public token is single use, a failure before exchange commits (including a key error at `createConnection`) cannot be retried with the same token; the failure state tells the owner to reopen Link.

The protected matcher covers the `(app)` group minus `/status` and `/signin`, plus every server action above. `proxy.ts` checks only cookie presence for redirecting; the authoritative check is a shared `requireSession` (session row unexpired and unrevoked) called by every protected page and action.

### Value sourcing

| Action               | Value produced or displayed                                          | Source                                                                                                                                                                                          |
| :------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signIn`             | owner identity                                                       | singleton owner row; password verified against `password_hash`                                                                                                                                  |
| `signIn`             | session token                                                        | 32 byte `crypto.randomBytes`; hash stored, raw value only in the cookie                                                                                                                         |
| `signIn`             | expiry values                                                        | injected server clock; slide = now + 7 days capped at created + 30 days                                                                                                                         |
| `signIn`             | redirect target                                                      | validated return path input (same origin, absolute path only) or `/spending` default                                                                                                            |
| session check        | owner ID for all services                                            | session row joined to owner via `token_hash` cookie lookup                                                                                                                                      |
| `createLinkToken`    | client_user_id                                                       | internal owner UUID, never the session token                                                                                                                                                    |
| `completeConnection` | access token, item id                                                | Plaid `/item/public_token/exchange`; token encrypted by `src/server/tokens.ts` before `createConnection`                                                                                        |
| `completeConnection` | institution id and name                                              | `/item/get` for `institution_id`, then `/institutions/get_by_id` for the name. Link metadata is display only and never trusted on conflict                                                      |
| initial sync         | accounts                                                             | `accounts` array on the `/transactions/sync` response, normalized to account observations                                                                                                       |
| initial sync         | expected cursor                                                      | `getConnectionSyncState` (null on first run); next cursor from the sync response                                                                                                                |
| initial sync         | normalized transactions                                              | sync response `added` mapped through the checked in category and classification table; `removed` and `modified` empty on a first page but handled                                               |
| `/spending`          | posted total, category totals, pending buckets, exclusions, coverage | `getMonthlySpending` (spec 0003), unchanged                                                                                                                                                     |
| `/spending`          | month                                                                | `month-param.ts`; omitted month from injected clock in `owner.time_zone`                                                                                                                        |
| `/spending`          | account balances and freshness                                       | account rows (current_units, currency, balance_observed_at) plus `last_successful_sync_at`, written by a new `markSyncSuccess` service the adapter calls after a committed page                 |
| `/spending`          | partial history notice                                               | `connection.history_complete` = false, read by the page through a narrow owner scoped connection query alongside `getMonthlySpending` (that service keeps its fixed unknown completeness value) |
| all actions          | failure display                                                      | shared `FailureCode` list (spec 0003); no raw errors or provider payloads                                                                                                                       |

### Plaid adapter rules

- Products: `transactions` only. No `auth` product; account and routing numbers are never requested.
- Link token created with `client_name` "Ledger", country `US`, language `en`, `client_user_id` = owner UUID, no webhook, no redirect URI.
- Mapping lives in a reviewed, checked in `category-map.ts` in `src/features/finance/`. It enumerates every Plaid `personal_finance_category.primary` value's classification and fallback stable key, plus `detailed` code overrides (for example `LOAN_PAYMENTS_CREDIT_CARD` to card payment, `RENT_AND_UTILITIES` to Housing or Utilities, `GENERAL_MERCHANDISE` to Shopping, `BANK_FEES` to Fees). Sign and primary rules derive classification: `TRANSFER_*` and card payment primaries never count as spending, `INCOME` primaries classify income, negative amounts in spending categories classify refund. Anything unmapped falls to the spec 0003 fallbacks (unknown outflow = spending + Uncategorized, unknown inflow = unclassified).
- Plaid amounts arrive as JSON numbers. Convert through their exact decimal string and validate against the currency scale registry; more precision than the scale or a non USD code fails the batch per spec 0003 rules (no cursor advancement, no rounding). Plaid and spec 0003 share the same sign convention (positive = outflow), confirmed by a dedicated test so a flipped assumption cannot corrupt every total.
- Normalization into the spec 0003 batch inputs:

| Plaid field                       | Batch field                                                             | Rule                                                                                                                                                             |
| :-------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction_id`                  | provider_transaction_id                                                 | verbatim                                                                                                                                                         |
| `account_id`                      | account via provider_account_id                                         | must match a known account in this connection                                                                                                                    |
| `amount`, `iso_currency_code`     | amount_units, currency_code, scale                                      | exact decimal string through the scale registry                                                                                                                  |
| `date` (pending)                  | provider_date                                                           | pending records get no posted_date                                                                                                                               |
| `date` (posted)                   | posted_date and provider_date                                           | calendar date verbatim                                                                                                                                           |
| `datetime`, `authorized_datetime` | authorized_date                                                         | truncated to calendar date; ignored otherwise                                                                                                                    |
| `pending`                         | posting_state                                                           | true maps to pending, false to posted                                                                                                                            |
| `pending_transaction_id`          | provider_pending_transaction_id                                         | explicit replacement link                                                                                                                                        |
| `name`, `merchant_name`           | description, merchant_name                                              | verbatim text                                                                                                                                                    |
| `personal_finance_category`       | provider_category_code, provider_category_id, provider_classification   | via `category-map.ts` above                                                                                                                                      |
| `removed[].transaction_id`        | removal IDs                                                             | one page carries added and removed entries; modified is treated as upsert                                                                                        |
| `accounts[]` on the sync response | account observations                                                    | `balances.current`, `available`, `limit`, and `iso_currency_code` become current_units, available_units, credit_limit_units, and scale through the same registry |
| `next_cursor`, `has_more`         | next cursor; `has_more` ignored except to keep `history_complete` false | one page commits, never claims completeness                                                                                                                      |

- The adapter is the only module allowed to call `decryptConnectionToken` and `getConnectionSyncState`. Plaintext tokens exist only inside adapter calls. A committed page is followed by the new `markSyncSuccess` owner scoped service, which sets `last_successful_sync_at`; a failed or partial run leaves it unchanged.
- Session slide writes `last_seen_at` at most once per minute per session, so ordinary page loads do not amplify database writes.

### Key invariants

- No financial service, server action, or page executes for a request without a valid session; the check lives in middleware and again inside each action.
- A session cookie alone never authorizes a write: the session row must be unexpired and unrevoked at action time.
- `history_complete` stays false until feature 6; one sync page never sets it.
- Month navigation permits previous and future months (future months render empty or zero totals); an invalid `?month=` falls back to the current month with the error state visible, never a broken page.
- The singleton owner cannot be created through sign in; `initializeOwner` and the password script are the only paths.
- `ledger` schema gains no table that stores plaintext credentials or tokens.

### Security model

One local owner, loopback only, Sandbox data. No compliance scope beyond existing boundaries. Password hashing uses Node `crypto.scrypt` (N=16384, r=8, p=1, 64 byte key, per password random 16 byte salt) verified with `timingSafeEqual`. Minimum password length 12. The cookie is `ledger_session`, httpOnly, `SameSite=Lax`, path `/`, `Secure` off (loopback http). CSRF is covered by the existing Host and Origin proxy checks plus SameSite. Failed sign in delay starts at 1 second after the fifth attempt within a process and doubles per further failure, capped at 30 seconds; it resets on restart. Sign in error messages never reveal which factor failed (there is only one) or whether the owner row exists. The `pnpm auth:set-password` script reads the password from interactive stdin or an environment variable, never argv (shell history would leak it), and requires `initializeOwner` to have already created the owner row.

### Configuration required

- `PLAID_CLIENT_ID`: Sandbox client identifier. Private server only.
- `PLAID_SECRET`: Sandbox secret. Private server only, never in browser bundles.
- `PLAID_ENV`: fixed literal `sandbox`; any other value fails validation.

All three join the existing Zod settings validation and are validated lazily when a Plaid action runs, so production builds still need no secrets. Playwright e2e runs reuse the owner `.env.local` Sandbox credentials; no committed fixtures carry credentials. `LEDGER_TOKEN_KEY_PATH` and `LEDGER_TOKEN_KEY_ID` (spec 0003) are required for connect and sync, not for sign in or reads.

### Critical test scenarios

- Happy path: set password by script, sign in, create link token, complete a Sandbox Link exchange with `user_good`/`pass_good`, run one sync page, and view a month with real totals, balances, and a partial history notice; verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**
- Failure case: sync fails after the connection commits; retry imports the same page once through the receipt path with no duplicates; verifies **AC-4**, **AC-8**
- Auth/permission: unsigned request to `/spending` redirects to `/signin`; a forged or expired cookie is rejected by middleware and by the action itself; verifies **AC-2**
- Money correctness: a transaction with precision beyond scale 2 or a non USD amount fails the batch without cursor advancement; mapping table coverage proves transfers and card payments never enter totals and that Plaid's positive outflow sign passes through unflipped; verifies **AC-6**
- Secrets: rendered pages, action results, logs, and diagnostics contain no token, secret, cursor, or account number; verifies **AC-7**

## Build plan

Follow Tracer Bullet: a thin signed in, connected, spending thread first, then deepen.

1. Extend the schema migration with `owner.password_hash`, `connection.history_complete`, and `session`. Add the `pnpm auth:set-password` script (scrypt hash, refuses to reveal or overwrite silently). Build sign in, session minting, sliding expiry, sign out, the proxy redirect, per action session checks, and the `/signin` page. Land `/spending` as an authenticated route rendering `getMonthlySpending` against whatever data exists (likely empty), so the auth thread is proven end to end before Plaid enters (AC-1, AC-2, AC-8 throttle).
2. Add Plaid settings validation and the adapter module: `createLinkToken`, the connect CTA with `react-plaid-link`, `completeConnection` doing exchange, `/item/get` for institution fields, and encrypted `createConnection`. Link exit is a quiet no op; failures keep committed state with retry (AC-3, AC-7).
3. Build the checked in category and classification mapping table, exact decimal normalization, account observation mapping, and the one page initial sync through `applyProviderBatch` inside `completeConnection`, plus `retryInitialSync`, `last_successful_sync_at` update, and the `history_complete` false write (AC-4, AC-6, AC-8).
4. Complete the `/spending` view: month navigation, posted total and category breakdown, account balances with freshness, partial history notice, pending exclusion awareness, and the empty, loading, error, and keyboard accessible states from spec 0004 primitives (AC-5).
5. Run `pnpm check`, the isolated database and service suites, the e2e path (sign in, connect, view) against Plaid Sandbox, secret absence checks, and README updates for password setup and Sandbox connect. Hand to `/check verify`, then `/test` (AC-1 through AC-8).

## Consequences

**Positive**:

- The walking skeleton works: auth, provider connection, storage, and display are proven on real data.
- Rolled sessions and the token envelope keep every secret off the browser and out of logs.
- Partial history is displayed honestly, which makes later sync work measurable.

**Negative / tradeoffs**:

- Custom session code is ours to get right: expiry, revocation, and timing safe comparison must be reviewed even though the surface is small.
- A restart clears the throttle, so a determined local process can keep guessing; acceptable at loopback scope.
- A `createConnection` failure after a successful exchange strands a Plaid item with no local record; the only recovery is reopening Link (the public token is single use), and a re-run reconciles through the `provider_item_id` unique constraint.
- The checked in category map will misclassify some real merchants until feature 7 adds owner editing.
- The session table grows one row per sign in; pruning is deferred.

**Neutral**:

- One migration extends three existing records; no new financial record types.
- `plaid` and `react-plaid-link` are the first provider dependencies; `argon2`, `bcrypt`, `better-auth`, and `Auth.js` were not added.

## Follow-up

- [ ] Feature 6 owns full pagination, webhooks, reconnect reconciliation, and flipping `history_complete`; this spec deliberately imports only one page.
- [ ] Feature 7 owns owner category edits and a transaction list; this view is read only.
- [ ] Update `AGENTS.md` context after build (new `/spending`, `/signin`, auth script, Plaid settings) via `/sync`.
- [ ] Consider whether the session table needs periodic pruning of expired rows; no pruning is introduced now.

## Rationale

Reasoning and alternatives: [rationale.md](rationale.md).
