# Financial data foundation reasoning

## Context

Ledger has a runnable local Next.js scaffold and established checks, but no financial records. Scope feature 3 requires durable records, ownership, exact money, migration boundaries, and encrypted token storage before the connection and spending slices begin. The existing architecture already chooses Postgres, Drizzle, pg, and reviewed SQL migrations.

The owner wants one local personal finance application, initially using Plaid Sandbox and USD totals. Other currencies must remain visible as coverage limits rather than silently entering those totals. The finance zone is America/New_York. Calendar month reporting, transfers, refunds, pending charges, and repeated imports need consistent meanings before later screens depend on them.

Sign in and provider workflows are deliberately later features. The foundation must be testable without exposing private records through the unauthenticated scaffold. No business use, payment processing, or additional regulatory requirement was identified. No regulatory certification is claimed.

## Options considered

### Option 1: Tables and persistence helpers only

Create the financial schema now and defer financial services to each later slice. This is the smallest immediate build and avoids speculative interfaces. Its cost is that migrations alone cannot prove spending rules, atomic imports, or correction preservation. Those rules would be discovered separately by several later features.

### Option 2: Relational records and narrow internal services

Create the durable records and the smallest server operations that enforce their rules. This makes exact totals, retries, ownership, and encryption verifiable without a screen or provider account. Its cost is more foundation work and a normalized input contract that the later provider adapter must satisfy.

### Option 3: Full event history with projections

Record every financial change as an event and derive current account, transaction, and budget state from that history. This supports rich replay and investigation. It also adds projection rebuilding, event versioning, and more recovery paths before one owner has a useful spending view. A minimal audit trail provides the immediate evidence needed without making every read a projection problem.

## Rationale

Choose option 2. A schema without financial services would defer the hardest correctness questions, while a full event architecture would add a second system to understand. Internal services provide a real thin path from normalized input through durable storage to exact monthly output. The owner explicitly excluded screens, manual entry, and provider requests from this feature. The runner up is option 1 if the owner later chooses to move service behavior into the spending slice, but that would weaken foundation verification.

Integer minor units fit USD budgeting and make accidental floating point arithmetic easier to detect. Exact decimal values are the credible alternative when many currencies and arbitrary precision calculations are core requirements. Here, an explicit currency scale registry retains supported foreign amounts without adding conversion or a decimal library. Rejecting unknown precision is safer than rounding or quietly advancing a cursor past an unsupported record.

Provider posted dates remain calendar dates because converting a date through UTC can move it into another reporting month. The explicit owner zone applies to timestamps and current month selection, not to rewriting provider dates. Locking the zone avoids silently changing established reporting assumptions.

Provider classifications supply the initial interpretation, while independent owner overrides preserve control. Automatically matching transfers by amount and date could hide two real purchases. Explicit provider identity and pending links are a stronger foundation. Unknown positive outflows still count as spending, a conscious bias against understating expenses. Unknown inflows are not assumed to be refunds.

A flat starter category list is sufficient for the first budgets. Hierarchies and split allocations would require additional reconciliation rules. Archival preserves existing budgets and historical explanations. One budget per category and month keeps zero, absence, overspending, and negative spending from refunds distinct.

A private key file is simpler than an operating system credential adapter for this local learning project and separates the token key from database backups. macOS Keychain is the runner up if platform integration becomes worth the extra adapter and recovery work. AES GCM through Node crypto avoids an unnecessary package. Record binding protects against moving an encrypted token to a different connection. This does not protect against a compromised operating system account that can read both database and key.

One configured key and a versioned envelope make the first encryption implementation manageable. A rotation command needs its own interruption and recovery contract. Failing closed on token operations, while preserving readable history, is more useful than treating a missing key as permission to generate another one.

A dedicated schema migration role reduces the privileges held by the running app. Using the bootstrap role for migrations is simpler, but exposes broader authority to ordinary tooling. Provisioning must cover existing volumes explicitly because initialization scripts do not rerun there. No volume reset is an acceptable shortcut.

Atomic batches and expected cursors make retries explainable. Revision protected owner writes avoid accidental overwrites between tabs. Audit metadata records successful changes without copying financial payloads into diagnostics. Database isolation and real constraint checks provide stronger evidence than mocked database calls alone.

The performance target is a local measurement, not a universal hardware guarantee. A defined synthetic fixture, warm read procedure, p95 threshold, and recorded query plan make it reproducible enough to identify missing indexes without adding caching or background infrastructure prematurely.

## Review and approved resolutions

The owner supplied a review summary requesting changes before implementation and approved the recommended resolutions. The summary explicitly did not establish that a different model performed the review. Some original findings were truncated; these resolutions cover the visible findings, not an unseen complete report.

Per field intent distinguishes untouched values, explicit overrides, explicit resets, and inherited corrections. A null override alone could not protect an owner's reset from later pending replacement. Posted intent takes precedence, and incompatible inherited classification is reported rather than silently changing a financial sign.

Atomicity does not determine which conflicting batch operation wins. Duplicate and overlapping identities now fail validation, and operation ordering is explicit. Replacement links become stable once established. Removing a posted successor cannot make its pending predecessor count again.

Request receipts are separate from audit events. A receipt survives later cursor movement and records the original acknowledgement. This avoids replaying an old import or inventing record revisions for successful no ops. Audit remains a record of actual changes, not the retry lookup mechanism. Canonical input encoding makes equivalent requests comparable while preserving the distinction between omitted edits and explicit resets.

Reporting now defines monthly candidates, fallback categories for refunds, and the account population for balance coverage. Connection transitions explicitly block imports outside active state. Local disconnect does not require decrypting a token and makes no claim about provider revocation. Verification includes effective role privileges, strict dates, and unknown commit outcomes. Audit guarantees apply to service writes, not arbitrary SQL with application credentials.

## Discovery and evidence

The working tree was clean and zero commits behind origin/main at discovery. The source inventory contained 18 TypeScript and TSX files under src, mostly scaffold and tests. No financial schema or provider integration exists. Related decisions are the accepted runnable scaffold and coding tooling specs. This decision extends their financial boundaries rather than replacing either spec.

The owner selected no References section and deferred optional migration skill and MCP discovery. No web research, skill installation, provider request, application code change, or database operation was performed during design. Detailed implementation syntax must be checked against installed package documentation during development, not treated as verified by this spec.
