# Verify: Spending investigation · spec 0007 · updated 2026-11-16

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Sign in, open `/spending` for a month with data → a Transactions table sits under the summary, newest effective date first, with date, description (merchant beside it when present), account, category, classification, amount → AC-1
- [x] With more than 50 rows in the month, press Load more by keyboard → 50 more rows append with no repeats; the button disappears on the last page → AC-1
- [x] Default view → only spending and refund rows (posted and pending); pending rows carry a Pending badge → AC-2
- [x] Check Show not counted → transfers, card payments, income, unclassified inflows and outflows, other currencies, removed and replaced rows appear, each with one "Not counted: <reason>" badge; removed and replaced rows have no edit button → AC-2
- [x] Choose a category, an account, and type a search, then reload the page → the same filters stay applied from the URL; a copied URL opens at the first page → AC-3
- [x] Choose Uncategorized → the URL holds `category=uncategorized` and only Uncategorized rows show → AC-3
- [x] Visit `/spending?category=<random uuid>` and `?account=bad` → the filter is dropped and the notice "A category or account filter was not found, so it was removed." shows → AC-3
- [x] Search for `%` or `_` → only rows with that literal character match; a 200 character search is cut to 120 → AC-3
- [x] With any filter on → the header shows "N matching transactions · posted spending $X"; with show not counted also on, N includes excluded rows but $X counts only posted spending and refunds → AC-4
- [x] Each breakdown row shows "N posted"; activate one by keyboard → the table filters to that category, and its posted rows equal N and its posted sum equals the row amount → AC-5
- [x] Open the edit popover on a live row (including a transfer under show not counted) → the category list holds only active categories; Spending is disabled for an inflow, Refund and Income are disabled for an outflow → AC-6
- [x] Pick a new category → the popover closes, the row shows Edited, and the month total and breakdown update → AC-6
- [x] Use provider category and Use provider classification → the row returns to the bank's values → AC-6
- [x] Edit a pending row's category, sync until it posts → the posted row keeps the edited category → AC-6
- [x] Open the popover in two tabs, save in one, then choose in the other → the second shows "This transaction changed before your edit saved…" with fresh values, and a second choice saves → AC-7
- [x] After any edit → loaded extra pages reset to the first page and the header counts refresh → AC-7
- [x] A month with no transactions shows "No transactions this month"; filters that match nothing show "No matching transactions" with Clear filters → AC-9
- [x] Keyboard only: Tab reaches the month links, breakdown rows, filters, search, show not counted, each edit button, the popover's category list and classification buttons, and Load more, with visible focus; Escape closes the popover → AC-9
- [x] Run axe on `/spending` with the popover closed and open → no violations → AC-9
- [x] At 390 px wide → the filters wrap and the table scrolls sideways; nothing overlaps → AC-9
- [x] Sign out, then call Load more or save an edit from an old tab → you are sent to `/signin` → AC-10

## Value sourcing

- [x] A posted row shows its posted date and a pending row its provider date; a pending charge dated in a month but posted in the next moves months → row date
- [x] A row with a merchant name different from its description shows both → description
- [x] The account column shows account name plus subtype → account label
- [x] A EUR row appears only under show not counted, badged Other currency, amount in EUR → amount and currency
- [x] A row with no owner or provider category shows Uncategorized; after an owner category edit it shows the owner's choice → effective category
- [x] A row's classification column matches the classification that sets its counted or not counted state in the summary → effective classification
- [x] Pending badge only on pending rows → pending badge
- [x] Edited badge appears after an override, after a reset, and on a posted row that inherited a pending edit → edited badge
- [x] A removed transfer shows Removed (not Transfer); a replaced pending row shows Replaced; a EUR transfer shows Other currency → exclusion reason precedence
- [x] The footnote's not counted total equals the number of badged rows under show not counted → exclusion counts on the summary
- [x] With no filters, show not counted off, and a filter that matches everything (search for a letter every row shares), the header sum equals the Posted spending total → filteredPostedUnits
- [x] A month in a different owner time zone boundary (for example a pending charge on the last local day) lands in the expected month → month bounds
- [x] An archived category does not appear in the edit picker but stays selectable as a filter when linked, labeled (archived); archived accounts appear in the account filter labeled (archived) → category picker and filter lists

## Commands

- [x] `pnpm check` → format, lint, types, and unit tests pass → AC-10
- [x] `pnpm build` → succeeds without a live database → AC-10
- [x] `set -a; . ./.env.test.local; set +a; pnpm exec vitest run test/foundation.transactions.test.ts` → 9 tests pass → AC-1 to AC-7, AC-10
- [x] `set -a; . ./.env.test.local; set +a; pnpm exec vitest run test/foundation.transactions.perf.test.ts` → p95 at or under 500 ms → AC-8
- [x] In the dev database, `SELECT indexname FROM pg_indexes WHERE indexname = 'transaction_owner_pending_provider_date_idx'` → one row → AC-8

## Acceptance-criteria coverage

- AC-1: table order and paging steps; integration paging test
- AC-2: default and show not counted steps; exclusion reason rows
- AC-3: URL filter, sentinel, normalization, and search steps
- AC-4: header count and sum step; filteredPostedUnits row
- AC-5: breakdown drill down step; integration drill down test
- AC-6: popover, save, reset, and pending carry over steps
- AC-7: two tab conflict and reset after edit steps
- AC-8: perf test and index commands
- AC-9: empty, no results, keyboard, axe, and narrow layout steps
- AC-10: signed out step, `pnpm check`, build, owner scoping test
