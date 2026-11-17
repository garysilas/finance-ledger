# 0007. Spending investigation: rationale

## Context

Scope feature 7 asks for a spending view that explains itself: a filterable transaction table, category edits that persist through sync, and monthly category totals that reconcile with stated rules. The shipped `/spending` page (spec 0005) already shows the month total, a category breakdown, balances, pending buckets, and an exclusion footnote, but none of it is explainable. A number the owner doubts cannot be traced to the charges behind it, and a wrong category cannot be fixed.

The domain layer is unusually ready for this. `setTransactionOverrides` already writes revision checked category and classification overrides that survive sync, inherit across pending replacements, and produce receipts and audit events. The schema already stores everything a table needs: description, merchant name, dates in both pending and posted forms, intent flags, and an edit revision counter. What is missing is a paged, filtered read path and the UI on top of it.

The forces at play: totals must stay reconciled with rows, so the table shares the month candidate predicate with `getMonthlySpending` rather than inventing its own. Large histories must stay usable, so paging and indexes matter even at personal scale. And the existing rules (transfers and card payments are not spending, refunds reduce their month, pending stays separate) constrain what the default row set may show.

## Options considered

### Option 1: Extend `/spending` with the table and inline editing (chosen)

Add the transaction table under the existing summary, drive it with a new `transaction-service` read path and keyset pagination, and edit through an inline popover wired to `setTransactionOverrides`.

**Pros**:

- The explainability loop stays on one page: total, breakdown, and rows reconcile in place, which is the whole point of the feature.
- Reuses every piece of write machinery; the only schema change is one index.
- Matches the Tracer Bullet approach: a thin end to end thread lands first, then filters and editing thicken it.

**Cons**:

- `/spending` becomes the heaviest page and accumulates the most client state of any screen so far.
- The page mixes two mental models (summary versus raw rows) on one scroll surface.

### Option 2: Separate `/transactions` route

A dedicated route owns the table, filters, and editing; `/spending` stays a summary that links over.

**Pros**:

- Cleaner separation of concerns; each page stays simple.
- A standalone route can later grow cross month search without contorting the spending page.

**Cons**:

- Drilling from a category total to its rows requires a navigation with filter state carried over, splitting the reconciliation story across two screens.
- Duplicates month navigation and freshness chrome, or forces the two pages to diverge.

### Option 3: TanStack Table or another data table library

Adopt a headless table library for sorting, filtering, and row state.

**Pros**:

- Built in state machinery if the table grows column sorting, selection, and virtual scrolling later.

**Cons**:

- A real dependency for behavior this spec can express with existing primitives and a few query params; premature.
- Pulls table state into a library model that must then be reconciled with URL param state anyway.

### Option 4: Client side table on a bulk fetch

Fetch the whole month (or history) once, then filter and page in the browser.

**Pros**:

- Instant filtering and trivial implementation after the first load.

**Cons**:

- Violates large histories stay usable: a month is small today, but the shape invites shipping unbounded payloads later; also pushes financial rows into long lived client memory.
- Server side filtering is needed regardless once excluded rows and search enter the picture.

## Rationale

The feature exists to make totals explainable, and explanation is strongest when the rows sit directly under the numbers they produce. Extending `/spending` keeps the month as the unit of investigation: one predicate defines the month for totals and rows alike, so reconciliation is structural rather than a convention the UI must remember. A separate route was the runner up and stays attractive for cross month search later, but routing away from the summary undercuts the drill down the engineer confirmed as the core interaction.

On the table itself, the engineer directed using the shadcn.io component library plus existing primitives rather than a data table dependency. Given filters live in the URL and sorting is fixed (date descending), a library's state machinery would fight the design rather than help it. Keyset pagination was chosen over offset paging because a sync can land mid session; a cursor on (effective date, id) stays stable where page numbers drift. It does not fully protect against membership changes (a pending row that posts moves its effective date), but page resets on edits and param changes bound how stale the accumulated list can get.

The riskiest decision is allowing edits on pending rows and letting them carry to posted replacements. The override machinery was built for exactly this in spec 0003, so enabling it costs no new mechanism and lets the owner fix an obviously wrong charge the moment it appears instead of after it posts.
