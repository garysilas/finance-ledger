# 0006. Reliable sync and account overview: rationale

## Context

Spec 0005 shipped the walking skeleton: one connect flow that imports exactly one `/transactions/sync` page and honestly flags history as partial. Feature 6 deepens that thread into something the owner can trust day to day. The forces shaping the design are the local only boundary (no public URL, so real Plaid webhook delivery is impossible without a tunnel the scope forbids), the single owner model (no multi tenant concerns, but a genuine need for replay safety), and the scope's explicit demand that webhook authenticity and repeated delivery be tested through a safe local Sandbox path.

The risk of getting this wrong is quiet data corruption: a cursor advancing over unwritten pages, a replayed webhook double applying changes, or two concurrent syncs racing on the same cursor. The existing foundation (`applyProviderBatch`, `request_receipt`, expected cursor checks) already solves atomicity per page; this feature extends the same guarantees across a whole run and across deliveries.

## Options considered

### Option 1: Owner trigger plus verified webhook handler (chosen)

One `syncConnection` service drains the cursor to completion, invoked by a Sync now action and by a verified webhook route. Webhook JWT verification uses `jose` against the key from `/webhook_verification_key/get`; deliveries are deduplicated by a unique `webhook_id` column storing the payload's `webhook_message_id`; Sandbox fires test webhooks at the local route during verification.

**Pros**:

- Proves the real production path (signature, dedup, item error handling) while staying inside the local only boundary.
- One sync implementation serves both triggers; no divergent code paths.
- Structural dedup and claim invariants make replay and concurrency safe by construction.

**Cons**:

- The webhook route is the first unauthenticated surface; it needs dedicated tamper tests.
- Real Plaid deliveries never reach the app in normal use, so webhook handling is exercised mainly in tests until a tunnel exists.

### Option 2: Owner action only, no webhook surface

Drop the webhook endpoint entirely and rely on Sync now (possibly plus sync on page load cadence).

**Pros**: smallest surface, nothing unauthenticated, no new dependency.

**Cons**: webhook authenticity would be untested or absent code, failing the scope's done when; the owner must remember to sync; reconnect and item error discovery lag behind reality.

### Option 3: Real webhook delivery through a tunnel or public URL

Expose the dev server through a tunnel so Sandbox (and later production) delivers genuine webhooks continuously.

**Pros**: most production like; continuous freshness without owner action.

**Cons**: violates the local only network boundary, adds a tunnel dependency and its credentials, and is unnecessary in Sandbox where transaction data changes only when test fixtures say so.

### Option 4: Bounded or single page sync runs

Keep the feature 5 granularity: one page per run (or a small cap), asking the owner to click repeatedly or a scheduler to loop.

**Pros**: smallest change to `importInitialSyncPage`; bounded request duration.

**Cons**: leaves `history_complete` false through many owner actions, adds resume UI burden, and solves a timeout problem a local app does not have.

## Rationale

Option 1 wins because it satisfies every requirement in the scope row without crossing the local only boundary. The webhook route exists and verifies real signatures, but deliveries arrive via Sandbox's fire endpoint during testing rather than a permanently open network path. Draining the cursor fully matches how `/transactions/sync` is designed to be used and makes `history_complete` mean exactly what it says.

Supporting calls made during design:

- `sync_started_at` claim over a Postgres advisory lock: the claim is inspectable, testable across separate requests, and matches the schema's optimistic style; a lock held inside a unit of work would be invisible to later requests.
- `webhook_delivery` table over reusing `request_receipt`: receipts describe applied batches; deliveries need a nullable connection (rejection before item resolution) and a text `webhook_id`, which does not fit the receipt's UUID request key.
- `jose` over hand rolling JWT checks with `node:crypto`: JWK to key conversion and claims validation are exactly the kind of code that fails silently when hand written; `jose` is small, audited, and standard in Next.js projects.
- Update mode Link for reconnect: it preserves the item and cursor, whereas a fresh exchange would create a new item and forfeit history continuity.
- Webhook URL registered at link token creation and backfilled via `/item/webhook/update` on the next successful sync (runner up: require disconnect and reconnect, which discards cursor state for no benefit).
- Process local JWK cache keyed by `kid` with refetch on verification failure (runner up: fetch per delivery, which turns every webhook into two provider calls).
