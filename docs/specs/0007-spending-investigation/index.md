# 0007. Spending investigation

**Date**: 2026-11-16
**Status**: In Progress

## Summary

Turn the `/spending` page into an investigation tool: a paged transaction table under the existing month summary, with category, account, and text search filters that live in the URL. The owner edits a row's category or classification inline, through the override machinery that already survives sync. Every total on the page stays explainable by drilling into the rows behind it. The schema gains only one index; everything else is new read and update paths on existing columns.

## Requirements

As the owner, I want to filter, inspect, and correct the transactions behind a month's totals so that every number on the spending page can be explained and kept accurate.

1. **AC-1**: `/spending` shows a transaction table below the month summary covering the selected month, sorted by effective date descending (`COALESCE(posted_date, provider_date)`, with the transaction id as the tiebreaker). Rows show date, description (with merchant name when present), account, effective category, effective classification, amount, and badges for pending, owner edited, and exclusion reason. Paging is keyset based with a load more control, 50 rows per fetch, accessible by keyboard.
2. **AC-2**: By default the table shows only rows that count toward the month total (posted and pending rows whose effective classification is spending or refund). A `show excluded` control reveals the rest: transfers, card payments, income, unclassified inflows, foreign currency rows, and removed or superseded rows, each carrying its exclusion reason badge. Removed and superseded rows render display only, with no edit affordance.
3. **AC-3**: Filters for category (effective category, including Uncategorized), account, and substring search on description and merchant name apply within the selected month only. Month, filters, search, and the excluded toggle all live in the URL query string; the page cursor stays client side, so a shared URL always opens at the first page. An unknown category or account id drops that filter and shows the same kind of normalization notice an invalid month produces. Uncategorized is encoded as the `uncategorized` sentinel in the URL and resolved to the owner's category id server side. Search text is trimmed, capped at 120 characters, and LIKE metacharacters (`%`, `_`, `\`) are escaped before matching.
4. **AC-4**: While any filter or search is active, the table header shows the matching row count (all matching rows, including excluded ones when shown) and the posted spending sum of the matching set (posted spending and refund rows only), so a filtered view still reconciles with the month total.
5. **AC-5**: Each category row in the existing breakdown shows its posted counting transaction count next to the amount, labeled as posted, and activating a row sets the table's category filter, so every breakdown figure drills into its transactions. The drilled table view may additionally show pending rows for that category.
6. **AC-6**: An inline popover on live rows edits the effective category (from active, non archived categories only, no new category creation) and the effective classification (all six values offered, sign invalid choices disabled per `classificationMatchesAmount`). Live excluded rows (transfers, card payments, income, foreign currency) are editable; removed and superseded rows are not. The popover offers reset to provider values for each field. Edits go through the existing override service, so they survive sync and pending edits carry to posted replacements.
7. **AC-7**: A stale edit (the row changed since render, or a pending replacement landed) returns the existing CONFLICT result; the UI refetches that row through an owner scoped single row read, shows a fixed conflict notice, and lets the owner retry on fresh data. After a successful edit, param change, or conflict the client discards accumulated pages and refetches the first page plus the count and sum header, while the server page revalidates, so a row that no longer matches leaves the view and all totals stay honest.
8. **AC-8**: Paged reads, filtered sums, and substring search over 100000 synthetic transactions meet the 500 millisecond warm read target from spec 0003, aided by a new partial index on transaction `(owner_id, provider_date) WHERE posting_state = 'pending'`.
9. **AC-9**: The table has loading, empty month, no results, and error states; all controls work by keyboard with visible focus, and badges carry meaning in text, not color alone.
10. **AC-10**: Every page load, load more fetch, and edit runs under `requireSession` with owner scoped queries, strict zod input validation, and the existing request receipt and audit event machinery. No financial payloads or raw errors reach the browser.

## Decision

**Chosen option**: Extend `/spending` in place with a keyset paged transaction table backed by a new `transaction-service` read path, shadcn.io table, popover, and command components installed into the existing `src/components/ui/` set, and a thin server action over `setTransactionOverrides` for edits.

**Implementation skills**: No community skill informed this decision. Components come from the connected shadcn.io server per the engineer's direction; the install token never enters the spec, scripts, or commits (per `src/components/AGENTS.md`).

This spec governs scope feature 7. Confirmation ratifies content, not shipment. Status follows the feature lifecycle.

## Feature design

**Data model sketch**:

No new entities. Reads and writes use existing columns on `ledger.transaction` (description, merchant name, amount units, currency code, posting state, provider date, posted date, removed at, superseded by id, provider and owner category and classification, intent fields, owner edit revision) and `ledger.category` (active rows only for the picker). One additive partial index supports the paged reads:

- `transaction (owner_id, provider_date) WHERE posting_state = 'pending'` for the pending side of the month set. Posted rows already have `transaction_owner_posted_date_idx`. The page query is one month bounded scan ordered by `COALESCE(posted_date, provider_date) DESC, id DESC` with a tuple keyset on those two expressions; month bounded sets are small enough that the residual in memory sort stays cheap, and the AC-8 test measures the real query.

**API surface** (server actions in `src/app/(app)/spending/actions.ts`, service reads in `src/features/finance/`):

| Surface                 | Kind          | Key inputs                                                                                                    | Key outputs                                                     | Auth                  | Key errors                         |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- | ---------------------------------- |
| `listMonthTransactions` | service read  | ownerId, month, categoryId?, accountId?, query?, showExcluded, cursor?                                        | rows, nextCursor, matchCount, filteredPostedUnits               | requireSession caller | INVALID_INPUT, NOT_FOUND           |
| `getTransaction`        | service read  | ownerId, transactionId                                                                                        | one row shaped as above, or not found                           | requireSession caller | INVALID_INPUT, NOT_FOUND           |
| `fetchTransactionPage`  | server action | same minus ownerId (from session)                                                                             | same                                                            | requireSession        | INVALID_INPUT                      |
| `updateTransaction`     | server action | transactionId, expectedOwnerEditRevision, categoryId? (null resets), classification? (null resets), requestId | effectiveCategoryId, effectiveClassification, ownerEditRevision | requireSession        | INVALID_INPUT, NOT_FOUND, CONFLICT |

**Value sourcing**:

| Action                  | Value produced or displayed     | Source                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listMonthTransactions` | row date                        | `posted_date` for posted rows, else `provider_date`                                                                                                                                                                               |
|                         | description                     | `description`; merchant name shown beside it from `merchant_name`                                                                                                                                                                 |
|                         | account label                   | `account.name` plus `account.subtype` via `account_id` join                                                                                                                                                                       |
|                         | amount and currency             | `amount_units` plus `currency_code` (non USD rows only appear under show excluded)                                                                                                                                                |
|                         | effective category              | COALESCE(`owner_category_id`, `provider_category_id`, Uncategorized id) joined to `category.label`                                                                                                                                |
|                         | effective classification        | `COALESCE(owner_classification, provider_classification)`, the same expression `getMonthlySpending` uses; imports already apply the spec 0003 fallbacks so provider classification is always set                                  |
|                         | pending badge                   | `posting_state = 'pending'`                                                                                                                                                                                                       |
|                         | edited badge                    | `category_intent` or `classification_intent` in `override`, `reset`, `inherited`                                                                                                                                                  |
|                         | exclusion reason                | derived in precedence order: removed (`removed_at`), superseded (`superseded_by_id`), foreign currency (`currency_code`), then effective classification transfer, card payment, income, unclassified inflow, unclassified outflow |
|                         | `ownerEditRevision`             | `owner_edit_revision` column, sent back on edit                                                                                                                                                                                   |
|                         | `matchCount`                    | COUNT over the same filtered query, all matching rows                                                                                                                                                                             |
|                         | `filteredPostedUnits`           | SUM over the same filtered query restricted to posted spending and refund rows                                                                                                                                                    |
|                         | `nextCursor`                    | last row's (effective date, id) pair                                                                                                                                                                                              |
|                         | month bounds                    | `month` param resolved through `resolveMonthParam` and `dates.ts` in `owner.time_zone`                                                                                                                                            |
|                         | category picker and filter list | `category` rows where `archived_at IS NULL`, plus the `uncategorized` sentinel resolved to the owner's Uncategorized id                                                                                                           |
|                         | account filter list             | `account` rows for the owner, archived accounts included and labeled                                                                                                                                                              |
|                         | exclusion counts on the summary | `getMonthlySpending` extended with `income` and `unclassifiedOutflow` buckets so the not counted footnote covers every hidden kind                                                                                                |
| `getTransaction`        | row values                      | same expressions as `listMonthTransactions`, scoped by id and owner                                                                                                                                                               |
| `updateTransaction`     | removed row guard               | `setTransactionOverrides` extended to return CONFLICT when `removed_at` is set, alongside the existing superseded check                                                                                                           |
| `updateTransaction`     | effective values after edit     | `setTransactionOverrides` result                                                                                                                                                                                                  |
|                         | refreshed totals                | `revalidatePath` on `/spending` after success                                                                                                                                                                                     |

**Key invariants**:

- The table never leaves the selected month; the month candidate predicate (posted joins `posted_date`, pending joins `provider_date`) is shared with `getMonthlySpending` so table rows and header totals always describe the same set.
- Default rows are exactly the rows contributing to the posted total or the pending buckets; the filtered posted sum under no filters equals `postedTotalUnits`.
- Effective category and classification use the identical COALESCE expressions as `getMonthlySpending`; the table invents no fallback of its own.
- Classification edits remain sign validated (`classificationMatchesAmount`); the popover disables sign invalid choices and a forged value returns INVALID_INPUT.
- Editing writes go only through `setTransactionOverrides`: revision checked, receipts and audit events preserved, pending inheritance untouched, and `removed_at` rows now rejected as CONFLICT inside the service.
- Search input is validated and bound as a parameter; substring match uses parameterized ILIKE on `description` and `merchant_name` only, with `%`, `_`, and `\` escaped.

**Security model**:

Single owner. Every page render and action calls `requireSession`; all queries scope by `owner_id`. Filter and search inputs pass strict zod schemas. Errors surface as fixed `FailureCode` values; no SQL, provider payloads, or raw exceptions reach the browser. Receipts and audit events come free through `runMutation`.

**Configuration required**: none.

**Critical test scenarios**:

- Happy path: a month with mixed rows renders the table, a category filter plus search narrows it, the count and sum match a hand computed expectation, verifies **AC-1**, **AC-3**, **AC-4**
- Reconciliation: with no filters the filtered posted sum equals `postedTotalUnits` and every breakdown count equals its drilled row count, verifies **AC-2**, **AC-4**, **AC-5**
- Edit survives sync: an owner category edit on a pending row, then a pending replacement import, keeps the override on the posted row, verifies **AC-6**
- Conflict: an edit submitted with a stale `ownerEditRevision` returns CONFLICT, the row refetches through `getTransaction`, and a retry on the fresh revision succeeds, verifies **AC-7**
- Guard: editing a removed or superseded row is impossible from the UI and a forged action call returns CONFLICT from the service without change, verifies **AC-2**, **AC-7**
- Performance: paged reads, filtered sums, and substring search over 100000 synthetic transactions stay under 500 milliseconds warm, verifies **AC-8**
- Accessibility: keyboard only flow reaches filters, the popover, and load more with visible focus; axe scan passes, verifies **AC-9**
- Auth: unsigned calls to `fetchTransactionPage` and `updateTransaction` are denied; another owner's transaction id returns NOT_FOUND, verifies **AC-10**

## Build plan

Tracer Bullet: stand up the thin end to end thread first (index, service, table, page), then thicken it with filters, drill down, and editing.

1. Migration adding the partial `transaction (owner_id, provider_date) WHERE posting_state = 'pending'` index; new `transaction-service.ts` with the shared month candidate predicate, the effective date keyset page query, and `getTransaction`; render a minimal table under the summary for the default counting row set, satisfies **AC-1**, **AC-2**
2. URL filter params (category with the Uncategorized sentinel, account, q, excluded), their parsing and normalization notices, the filter controls, the excluded toggle with precedence ordered reason badges, the income and unclassified outflow exclusion buckets in `getMonthlySpending`, and the filtered count plus sum header, satisfies **AC-2**, **AC-3**, **AC-4**
3. Breakdown posted transaction counts and category rows acting as table filters, satisfies **AC-5**
4. `updateTransaction` server action, the `removed_at` guard inside `setTransactionOverrides`, the inline popover (shadcn.io popover plus command over the active category list, all six classifications with sign invalid choices disabled, per field reset), edited badges, conflict refetch and notice, and post edit page discard plus revalidation, satisfies **AC-6**, **AC-7**
5. Load more paging polish, all loading, empty, no results, and error states, keyboard and axe pass, the 100000 row performance check including search, and unit tests beside each new module, satisfies **AC-8**, **AC-9**, **AC-10**

## Consequences

**Positive**:

- Every figure on `/spending` becomes traceable to real rows; misclassified imports are correctable without waiting for provider fixes.
- No new tables or write machinery: edits reuse the revision checked, receipt writing override service, so sync safety rules from spec 0003 hold unchanged.
- URL state keeps investigations shareable and back button friendly at no extra storage cost.

**Negative / tradeoffs**:

- `/spending` grows into the heaviest page in the app: more query variants, more client state, and the first server action driven table. Complexity budget is spent here instead of a separate route.
- The new index adds write amplification on imports; negligible at Sandbox volume but real.
- Month scoped search means a remembered charge from another month still cannot be found; cross month search stays unsolved.

**Neutral**:

- First feature to install new shadcn.io components (table, popover, command) into `src/components/ui/`; install URLs embed the owner token and must stay out of commits and specs.
- Exclusion accounting gains income and unclassified outflow buckets so the not counted footnote covers every hidden kind.
- `setTransactionOverrides` gains a `removed_at` guard returning CONFLICT; a small service change that protects every caller, not just this UI.
- A sync landing mid session can move a pending row's effective date when it posts, so a row may appear twice across accumulated pages or vanish until refresh; accepted, since post edit and param changes reset loaded pages anyway.

## Follow-up

- [ ] `AGENTS.md` still records the shadcn MCP server as declined, yet this feature installs components through the connected shadcn.io server; `/sync` should reconcile that line after this ships.
- [ ] Cross month transaction search is deferred; revisit if investigation repeatedly needs it.
- [ ] Category creation during editing is deferred to the budgets feature (feature 8) or its own spec if needed sooner.

## Rationale

Reasoning and options considered: see [rationale.md](rationale.md).
