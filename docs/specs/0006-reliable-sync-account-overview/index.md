# 0006. Reliable sync and account overview

**Date**: 2026-11-15
**Status**: Accepted

## Summary

Turn the single page import from spec 0005 into a dependable sync that drains every `/transactions/sync` page, and add a new `/accounts` overview showing balances, sync health, and net worth. Plaid webhooks (signed notices that new data exists) are verified cryptographically and deduplicated so repeated delivery applies once. Reconnect uses Plaid Link update mode, and disconnect keeps stored records while clearing the token.

## Requirements

As the owner, I want my connection to stay current without manual babysitting, and to see every account balance plus my net worth with honest freshness, so that I can trust the stored data.

1. **AC-1**: A sync run reads `/transactions/sync` pages until `has_more` is false. Each page is normalized and committed atomically through `applyProviderBatch`, advancing the cursor only on commit. Added, modified, and removed records apply correctly, including pending replacement. A run that began with a null cursor sets `history_complete` to true when it reaches the end.
2. **AC-2**: `POST /api/webhooks/plaid` reads the raw body, verifies the `Plaid-Verification` JWT (ES256) against the key from `/webhook_verification_key/get` using `jose`, and only then trusts the payload. Missing or invalid signatures get a generic rejection with no detail and nothing logged. The route sits outside the session protected matcher.
3. **AC-3**: Every verified delivery is recorded in `webhook_delivery` keyed on `webhook_id` (the payload's `webhook_message_id` field; Plaid webhook ids are globally unique, so the id alone is the dedup key). A repeated delivery is a recorded `duplicate` and never triggers a second sync, even when the first delivery could not resolve a connection.
4. **AC-4**: Verified `TRANSACTIONS` update codes (`INITIAL_UPDATE`, `HISTORICAL_UPDATE`, `DEFAULT_UPDATE`, `SYNC_UPDATES_AVAILABLE`) start a drain. An `ITEM` webhook whose `error.error_code` is `ITEM_LOGIN_REQUIRED`, `ITEM_EXPIRED`, `NO_ACCOUNTS`, or `ITEM_LOCKED` sets the connection to `needs_reconnect`. All other types are recorded with outcome `ignored`.
5. **AC-5**: Only one sync runs per connection at a time. A run claims the connection by setting `sync_started_at` atomically; a claim older than 10 minutes may be reclaimed. A second trigger while claimed is a safe no op (`SYNC_IN_PROGRESS` for the owner action, a recorded duplicate style no op for a webhook).
6. **AC-6**: A provider failure mid run keeps all committed pages, clears the claim, and records `last_sync_failure` with a `FailureCode`; the failure clears when a later run completes fully. The next run resumes from the last committed cursor, never from scratch. Individual Plaid calls retry up to 3 attempts with a 250 ms base delay doubling per attempt; only `PROVIDER_UNAVAILABLE` retries, while `ITEM_*` errors and validation failures are terminal.
7. **AC-7**: A `needs_reconnect` connection offers Reconnect, which creates a link token in update mode bound to the existing access token. On Link completion the server calls `/item/get` and confirms the item error cleared before returning the connection to `active`; client reported success alone never flips the state, the cursor is preserved, and a closed Link changes nothing.
8. **AC-8**: Disconnect clears the token envelope and sets state `disconnected`. Accounts and transactions stay stored and visible, marked as no longer updating.
9. **AC-9**: `/accounts` lists every account with its balance and `balance_observed_at` age, the connection's `last_successful_sync_at`, `last_sync_failure`, and `history_complete`, and a net worth figure computed as assets (depository, investment) minus liabilities (credit, loan) from current balances. Accounts missing balances appear under a coverage notice rather than being guessed. Loading, empty, and error states stay keyboard accessible with visible focus.

## Decision

**Chosen option**: Owner triggered Sync now plus a cryptographically verified webhook route, both driving the same cursor draining sync service; one new `webhook_delivery` table for dedup and audit; reconnect via Link update mode; account overview as a new `/accounts` route.

**Implementation skills**: `plaid-fintech` (`sickn33/agentic-awesome-skills`, `.agents/skills/plaid-fintech/`): Plaid transactions sync, webhook verification, and token lifecycle patterns that shaped this design.

This spec governs scope feature 6. Confirmation ratifies content, not shipment. Status follows the feature lifecycle.

## Feature design

### Records and relationships

Use the existing `ledger` schema. One reviewed migration adds:

| Record              | Fields                                                                                                                                        | Constraints                                                                                                                                                                                                                   |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connection (extend) | `sync_started_at` timestamptz nullable, `last_sync_attempt_at` timestamptz nullable, `last_sync_failure` text nullable                        | `last_sync_failure` holds a `FailureCode` when set, null on clean state. `sync_started_at` is the concurrency claim.                                                                                                          |
| webhook_delivery    | id UUID, owner_id FK, connection_id FK nullable, webhook_id text, webhook_type text, webhook_code text, outcome text, received_at timestamptz | Unique on `webhook_id` alone (globally unique per Plaid, so null connections still dedup). `connection_id` nullable because item resolution can fail. `outcome` in `received`, `applied`, `duplicate`, `ignored`, `rejected`. |

Everything else is reuse: `request_receipt` records each committed page, `account` already carries balances and `balance_observed_at`, and `history_complete` already exists.

### State transitions

Sync run lifecycle on a connection: idle (claim null) → running (`sync_started_at` set, pages committing) → idle again (claim cleared on success or failure). A claim older than 10 minutes is stale and reclaimable.

Connection state gains no new values. `active` → `needs_reconnect` when a sync or webhook reports an item error; `needs_reconnect` → `active` on successful update mode Link; `active` or `needs_reconnect` → `disconnected` clears the envelope (per spec 0003's existing checks). `history_complete` flips to true only once, at the end of a drain that began at a null cursor.

`webhook_delivery` lifecycle: inserted as `received` before handling, then updated to `applied` (a sync ran or was claimed by it), `ignored`, or `rejected` after handling. A row stuck in `received` marks a delivery whose sync never ran, visible in health checks. A second delivery with the same `webhook_id` hits the unique constraint and is recorded `duplicate`.

### API surface

Server Actions, server rendered routes, and one route handler for webhooks.

| Surface                    | Kind       | Key inputs                                | Key outputs                                                              | Auth      | Key errors                                                        |
| :------------------------- | :--------- | :---------------------------------------- | :----------------------------------------------------------------------- | :-------- | :---------------------------------------------------------------- |
| `/api/webhooks/plaid`      | POST route | raw body, `Plaid-Verification` JWT header | 200 on verified and recorded, generic rejection otherwise                | signature | unverified (401, no detail)                                       |
| `syncConnection`           | action     | connection id                             | sync outcome: pages, counts (added, updated, removed)                    | session   | PROVIDER_UNAVAILABLE, SYNC_IN_PROGRESS, NEEDS_RECONNECT, CONFLICT |
| `createReconnectLinkToken` | action     | connection id                             | link_token bound to the item's access token (update mode)                | session   | PROVIDER_UNAVAILABLE, INVALID_TRANSITION, NOT_FOUND               |
| `completeReconnect`        | action     | connection id                             | `/item/get` confirms the item error cleared; connection back to `active` | session   | INVALID_TRANSITION, ITEM_STILL_ERROR, NOT_FOUND                   |
| `disconnectConnection`     | action     | connection id                             | connection `disconnected`, token cleared                                 | session   | INVALID_TRANSITION, NOT_FOUND                                     |
| `/accounts` route          | page       | none                                      | account list, balances, freshness, sync health, net worth                | session   | generic failure state                                             |

The webhook route verifies the JWT before parsing semantics, then Zod validates the body's `webhook_type`, `webhook_code`, and `item_id`. A verified delivery for an unknown `item_id` records `rejected` with `connection_id` null. For a sync triggering type it inserts the delivery as `received`, runs the drain inside the request (Sandbox has no delivery timeout, and the claim makes concurrent triggers safe), then updates the row to `applied`. The route returns 200 for every verified delivery including duplicates and ignored types; only signature failure rejects.

### Value sourcing

| Action                     | Value produced or displayed | Source                                                                                                                                                                                                                                                                                                                                        |
| :------------------------- | :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| webhook route              | webhook authenticity        | `Plaid-Verification` JWT, verified via `jose` against the JWK from `/webhook_verification_key/get`; key cached in process keyed by `kid`, refetched on verification failure                                                                                                                                                                   |
| webhook route              | connection for a delivery   | `provider_item_id` from the verified payload matched to `connection.provider_item_id`                                                                                                                                                                                                                                                         |
| webhook route              | dedup decision              | `webhook_id` unique constraint on `webhook_delivery`                                                                                                                                                                                                                                                                                          |
| `syncConnection`           | sync claim                  | atomic `UPDATE connection SET sync_started_at = now() WHERE sync_started_at IS NULL OR sync_started_at < now() - 10 minutes`                                                                                                                                                                                                                  |
| `syncConnection`           | cursor and token            | `getConnectionSyncState` and `decryptConnectionToken` inside `plaid.ts` (unchanged trusted adapter boundary)                                                                                                                                                                                                                                  |
| `syncConnection`           | history_complete            | set true when a drain begun at a null cursor reaches `has_more = false`                                                                                                                                                                                                                                                                       |
| `syncConnection`           | sync state fields           | one `sync-state` service owns `sync_started_at`, `last_sync_attempt_at`, `last_sync_failure`, and `history_complete`; `last_sync_failure` clears when a run completes fully, not per page                                                                                                                                                     |
| `syncConnection`           | last_sync_failure           | `FailureCode` from the failing step                                                                                                                                                                                                                                                                                                           |
| `syncConnection`           | counts and outcome notice   | `applyProviderBatch` counts aggregated across committed pages                                                                                                                                                                                                                                                                                 |
| `createReconnectLinkToken` | update mode link token      | `linkTokenCreate` with `access_token` set to the decrypted item token, no products argument, and the same `webhook` URL                                                                                                                                                                                                                       |
| webhook registration       | item webhook URL            | `PLAID_WEBHOOK_URL` passed as `webhook` on link token creation (connect and update mode); existing connections get `/item/webhook/update` before the drain inside their next sync, and a failure there never fails the sync                                                                                                                   |
| `disconnectConnection`     | cleared credentials         | token envelope columns set null and `state = 'disconnected'` in one unit of work                                                                                                                                                                                                                                                              |
| `/accounts`                | balances and freshness      | account rows (`current_units`, `available_units`, `credit_limit_units`, `currency`, `balance_observed_at`, `archived_at`)                                                                                                                                                                                                                     |
| `/accounts`                | sync health                 | `connection.last_successful_sync_at`, `last_sync_attempt_at`, `last_sync_failure`, `history_complete`, `state`, `sync_started_at`                                                                                                                                                                                                             |
| `/accounts`                | net worth                   | a `net-worth` read service in `src/features/finance/` sums `current_units` by Plaid `type`: `depository` and `investment` are assets, `credit` and `loan` are positive amounts owed subtracted as liabilities; only `USD` currency accounts enter the total, and archived, non USD, or null balance accounts appear under the coverage notice |
| all actions                | owner identity              | `requireSession` (spec 0005); the webhook route substitutes signature verification                                                                                                                                                                                                                                                            |

### Plaid adapter rules

- Sync loop: `transactionsSync` is called per page with the committed cursor; `added` and `modified` map to upserts, `removed` to removal IDs, exactly as `normalizeSyncPage` already does. Each page commits through `applyProviderBatch` before the next fetch, so a crash never loses committed pages and the cursor never advances over unwritten data.
- Webhook verification: header JWT `kid` selects the JWK; verify ES256 signature and that the `request_body_sha256` claim matches the raw body before trusting any field.
- Update mode Link: reconnect passes the existing access token to `linkTokenCreate` so Plaid reuses the item; the resulting public token is never exchanged (update mode returns no new token). `completeReconnect` then calls `/item/get` and flips to `active` only when the item's error field is clear.
- Item errors: during sync or in a verified `ITEM` webhook, `ITEM_LOGIN_REQUIRED`, `ITEM_EXPIRED`, `NO_ACCOUNTS`, and `ITEM_LOCKED` map to `needs_reconnect`; all other provider errors map to `PROVIDER_UNAVAILABLE`.
- Modified records: the drain changes nothing about `applyProviderBatch` semantics; `modified` maps to upsert and pending replacement works through `provider_pending_transaction_id` exactly as spec 0003 defines.
- `errors.ts` gains `SYNC_IN_PROGRESS`, `NEEDS_RECONNECT`, and `ITEM_STILL_ERROR` if absent; `CONFLICT` remains the expected cursor race outcome.
- Local test delivery: a `pnpm` script or test helper calls Plaid's `sandboxItemFireWebhook` with the stored sandbox access token so the real route receives a real signed webhook; unit tests inject a test generated JWK into the verifier to cover crafted deliveries.
- Verification key fetch goes through the same `plaid.ts` adapter; keys and payloads never reach logs or the browser.

### Key invariants

- A page is committed or it is not; the cursor never advances past uncommitted data (spec 0003 unit of work, unchanged).
- One running sync per connection at any instant, enforced by the atomic claim, not by request ordering.
- One `webhook_id` produces at most one `applied` outcome, enforced by the unique constraint.
- `history_complete` is monotonic: once true it never returns to false.
- A `disconnected` connection has all token envelope columns null (existing check) and accepts no sync or reconnect attempts.
- Access tokens, cursors, webhook payloads, and verification keys never reach the browser, logs, or diagnostics.

### Security model

The only unauthenticated surface is `POST /api/webhooks/plaid`, and its authentication is the signature: unverified requests are rejected generically before payload processing, bodies are never logged, and the proxy matcher excludes it. Everything else requires `requireSession`. The owner sees only narrow display values; financial payloads and secrets stay server side per the scope boundaries.

### Configuration required

- `PLAID_WEBHOOK_URL`: the URL Plaid calls back on; in local use it points at the dev server path `/api/webhooks/plaid` (reachable however the engineer exposes it during a Sandbox fire test). Passed as `webhook` on link token creation and applied to existing connections via `/item/webhook/update`.
- `jose`: new dependency for ES256 JWT and JWK verification.

### Critical test scenarios

- Happy path: connect, drain multiple Sandbox pages including added, modified, removed, and a pending record replaced by its posted version; `history_complete` true, totals correct, verifies **AC-1**
- Webhook path: fire a real signed Sandbox webhook at the local route via `sandboxItemFireWebhook`; verified, recorded `applied`, sync ran; the same `webhook_id` sent again records `duplicate` and does not re-sync, verifies **AC-2**, **AC-3**, **AC-4**
- Tamper path: a request with a bad or missing signature gets the generic rejection and writes nothing, verifies **AC-2**
- Concurrency: a second `syncConnection` while claimed returns `SYNC_IN_PROGRESS`; a claim older than 10 minutes is reclaimed, verifies **AC-5**
- Mid run failure: provider fails on page 2 of 3; page 1 stays committed, claim clears, `last_sync_failure` set; retry resumes from the page 1 cursor, verifies **AC-6**
- Reconnect: a simulated `ITEM_LOGIN_REQUIRED` marks `needs_reconnect`; update mode Link completes and returns it to `active` with the cursor intact, verifies **AC-7**
- Disconnect: disconnect clears the envelope; stored accounts and transactions still render as not updating, verifies **AC-8**
- Overview: accounts with mixed types produce correct net worth, an account with a null balance appears under the coverage notice, verifies **AC-9**

## Build plan

Tracer Bullet ordering: prove a thin end to end thread first, then thicken.

1. Migration plus the draining sync: add the `connection` fields and `webhook_delivery` table, extend `plaid.ts` into a drain loop with per page commits, claim, retry bound, `history_complete`, and a `syncConnection` action wired to a Sync now control on a minimal `/accounts` page, satisfies **AC-1**, **AC-5**, **AC-6**
2. Webhook path: `POST /api/webhooks/plaid` with `jose` verification, `webhook_delivery` dedup, trigger mapping, matcher exclusion, and `PLAID_WEBHOOK_URL` registration on link token creation plus `/item/webhook/update`, satisfies **AC-2**, **AC-3**, **AC-4**
3. Reconnect and disconnect: update mode `createReconnectLinkToken`, `completeReconnect`, `disconnectConnection`, item error mapping to `needs_reconnect`, and connection state UI, satisfies **AC-7**, **AC-8**
4. Account overview completeness: full `/accounts` presentation with per account freshness, sync health display, net worth by type, coverage notice, and all loading, empty, and error states, satisfies **AC-9**

## Consequences

**Positive**:

- Sync becomes incremental and resumable; a failure never replays committed work.
- Webhook dedup is proven structurally by the unique constraint, not by convention.
- `/accounts` gives the owner one honest view of balances, staleness, and coverage.

**Negative / tradeoffs**:

- The webhook route is the app's first unauthenticated surface; its correctness rests entirely on JWT verification, which tests must prove.
- The process local JWK cache means key rotation needs a refetch on failure path; acceptable for a single process app.
- A long first drain still runs inside one request; a very large history could approach route timeouts (mitigated by resumability, not eliminated).

**Neutral**:

- One migration adds three nullable columns and one table; existing rows need no backfill.
- `jose` joins the dependency list; tool and skill discovery for it was declined.
- Sync concurrency is per process; the app runs one process, so this is sufficient.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
