# Scope: Ledger

Ledger is a personal finance web app for one owner. It helps you understand spending and stay within monthly budgets, then adds an AI copilot with useful visual answers.

**Build approach:** Tracer Bullet (prove a thin working path through storage, server, and UI, then deepen it).
**Workflow:** Beta (after `/develop`, run `/check verify`, then `/test`). All features inherit this depth.
**Release boundary:** Spending and budgets are the first useful release, through feature 8. Full v1 includes features 9 through 13. Deferred ideas are not required for v1.
**Success:** You can explain a month's spending, see which categories exceed budget, and trace the totals back to transactions. AI extends this loop rather than becoming a prerequisite for it.

## Boundaries and shared acceptance criteria

Ledger runs on this machine, with Postgres in Docker. Browser access is local only. One owner signs in, with no public registration, billing, marketing site, or external product analytics. This is a lasting learning project, with no fixed delivery date stated. Explain important decisions briefly in the specs.

Use Plaid Sandbox until the owner explicitly approves otherwise. Access tokens are encrypted at rest and available only to the server. They never reach the browser, logs, or model. Credentials and account numbers never enter model context. Safe local diagnostics must not contain financial payloads or secrets.

Money is never stored as floating point values. V1 uses USD, English, calendar months in one explicit local time zone, and budgets without rollover. Confirm the time zone during data design. Transfers and credit card payments do not count as spending. Refunds reduce spending in their posted month. Pending charges are shown separately from posted totals. Other currencies must not silently enter USD totals.

The model gets only read only, typed, zod validated tools, never raw SQL or credentials. Send only minimal aggregate data. Chat is explicit, not a background task. AI initiated budget writes require explicit UI confirmation through a separate application action, not a writable model tool.

Polish desktop first, keep narrow layouts usable, and target WCAG 2.2 AA. Each UI feature includes keyboard support, visible focus, loading, empty, and error states. Each money or tool feature includes relevant boundary and failure tests. Show data freshness, avoid blocking local navigation on external services, and establish measurable performance checks in the relevant specs.

Preferred stack is an owner proposal, not a scope decision: Next.js App Router, strict TypeScript, Tailwind, shadcn/ui, tweakcn CSS variables, Drizzle with Postgres, Plaid, and OpenAI. `/architect` ratifies choices. This scope chooses no additional tools.

## At a glance

| #   | Feature                            | Phase      | Status      |
| --- | ---------------------------------- | ---------- | ----------- |
| 1   | Architecture and runnable scaffold | Foundation | done        |
| 2   | Coding standards and tooling       | Foundation | done        |
| 3   | Financial data foundation          | Foundation | done        |
| 4   | Design system and app shell        | Foundation | done        |
| 5   | Owner to first spending view       | Slice 1    | planned     |
| 6   | Reliable sync and account overview | Slice 2    | planned     |
| 7   | Spending investigation             | Slice 3    | planned     |
| 8   | Monthly category budgets           | Slice 4    | planned     |
| 9   | Recurring charge suggestions       | Slice 5    | planned     |
| 10  | Read only finance chat             | Slice 6    | planned     |
| 11  | Generated finance views            | Slice 7    | planned     |
| 12  | Confirmed budget proposals         | Slice 8    | planned     |
| 13  | Recovery and v1 readiness          | Slice 9    | planned     |
| 14  | Weekly AI review                   | Deferred   | planned     |
| 15  | Anomaly alerts                     | Deferred   | planned     |
| 16  | Savings goals                      | Deferred   | planned     |
| 17  | Debt payoff                        | Deferred   | planned     |
| 18  | Investments                        | Deferred   | planned     |

## Foundations

### 1. Architecture and runnable scaffold · done

Build the smallest runnable project from the confirmed architecture. Install only what the current slice needs, not every future integration. Minimum test frameworks are Vitest and Playwright with Chromium. Broader tooling remains in feature 2.

**Done when:** the scaffold respects local operation and security boundaries, starts locally, passes its production build and strict typecheck, and completes the spec's verification and Beta tests. Minimal setup and operating instructions are included.

**Spec:** [0001](../specs/0001-architecture-runnable-scaffold/index.md), architecture content confirmed.
**Code:** `src/` (app, server, components), `docker-compose.yml`, `db/init/`, `README.md`

- [x] Decide it (spec): `/architect architecture and runnable scaffold`
- [x] Scaffold from the decision: `/develop architecture and runnable scaffold`
- [x] Verify it: `/check verify architecture and runnable scaffold`
- [x] Test it: `/test architecture and runnable scaffold`

### 2. Coding standards and tooling · done

Capture conventions from the real scaffold, then establish consistent checks for later work. Keep explanations useful for learning.

**Done when:** root project guidance reflects the actual project, and formatting, lint, strict type checks, and the chosen automated checks run successfully.

**Spec:** [0002](../specs/0002-coding-standards-tooling.md), tooling content confirmed.
**Code:** `package.json`, `pnpm-lock.yaml`, `.devin/prettier.json`, `.devin/prettier.ignore`, `README.md`

- [x] Capture conventions and tooling choices: `/audit`
- [x] Decide tooling (spec): `/architect tooling`
- [x] Build from the standard: `/develop tooling`
- [x] Verify it: `/check verify tooling`
- [x] Test it: `/test tooling`

### 3. Financial data foundation · done

Define the durable financial records, ownership, money rules, and migration boundaries. Establish only the core structures required by early slices, with clear extension points.

**Done when:** migrations support owner, connection, account, transaction, category, and budget records; exact money, currency, time zone, transfer, refund, pending, and duplicate handling rules have enforceable definitions; encrypted token storage and key recovery boundaries are recorded.

**Spec:** [0003](../specs/0003-financial-data-foundation/index.md), content confirmed after review resolutions.
**Code:** `src/features/finance/`, `src/server/db/` (schema, unit of work), `src/server/tokens.ts`, `db/migrations/`, `db/provision/`, `scripts/`, `docker-compose.test.yml`

- [x] Design it (spec): `/architect financial data foundation`
- [x] Build it: `/develop financial data foundation`
  1. Prove migrations, restricted roles, request receipts, and one encrypted synthetic connection through a real monthly spending read (AC-1, AC-2, AC-3, AC-8, AC-10, AC-11).
  2. Complete atomic imports, deterministic retries, pending replacement, owner intent, and currency rules (AC-2, AC-4, AC-5, AC-6, AC-11, AC-12).
  3. Add monthly budgets, category totals, coverage metadata, and measured query performance (AC-3, AC-7, AC-10, AC-12).
  4. Complete key failure handling, local disconnect, safe operation instructions, and regression checks (AC-1 through AC-12).
- [x] Verify it: `/check verify financial data foundation`
- [x] Test it: `/test financial data foundation`

### 4. Design system and app shell · done

Set a cohesive visual language and navigation for spending, budgets, accounts, and later chat. Build reusable primitives rather than complete screens on fake data.

**Done when:** the visual spec defines type, spacing, semantic colors, theme variables, and accessible components; the shell supports desktop and narrow layouts with clear navigation and shared state patterns.

**Spec:** [0004](../specs/0004-design-system-app-shell/index.md), content confirmed after cross check resolutions.

**Code:** `src/components/` (ui, shell, finance, states), `src/app/(app)/`, `src/app/design/`, `src/features/finance/format.ts`, `src/features/finance/month-param.ts`, `src/app/globals.css`, `playwright.design.config.ts`

- [x] Design it (spec): `/architect design system and app shell`
- [x] Build it: `/develop design system and app shell`
  1. [x] Prove a thin themed shell around the real status page at `/status`, with the redirect, the wider proxy matcher, and the streamed health indicator (AC-1, AC-3, AC-4, AC-5, AC-8).
  2. [x] Tune the tweakcn tokens, add status tokens, the theme control, and the narrow sheet layout, with axe scans (AC-2, AC-6, AC-7, AC-15).
  3. [x] Build money, date, freshness, status badge, month param, and state primitives (AC-9 through AC-13).
  4. [x] Add the dev only `/design` reference, its development test suite, the layout shift check, and README updates (AC-14, AC-15).
- [x] Verify it: `/check verify design system and app shell`
- [x] Test it: `/test design system and app shell`

## Slice 1: Prove the real spending path

### 5. Owner to first spending view · planned · needs a decision

Make the first real thread work: owner sign in, connect one Sandbox institution, persist accounts and an initial transaction page, then show actual stored spending. This is the walking skeleton, not a disposable demo.

**Done when:** only the owner can reach protected UI and server actions; one Sandbox connection survives restart; stored balances and posted transactions render correctly; tokens remain server side and encrypted; initial sync uses the cursor path without pretending incomplete history is complete.

- [ ] Design it (spec): `/architect owner to first spending view`

## Slice 2: Trust the connected data

### 6. Reliable sync and account overview · planned · needs a decision

Deepen the existing connection path with reliable updates, sync health, balances, and net worth. Prove changes are applied once even when delivery repeats.

**Done when:** `/transactions/sync` handles all pages, cursor advancement, retries, added, modified, and removed records, including pending replacement; webhook authenticity and repeated delivery are tested through a safe local Sandbox path; reconnect and disconnect behavior is clear; account balances and asset minus liability net worth show freshness and coverage limits.

- [ ] Design it (spec): `/architect reliable sync and account overview`

## Slice 3: Explain a month

### 7. Spending investigation · planned · needs a decision

Expand the stored spending view into a useful transaction table and monthly category breakdown. Make every summary explainable through the underlying transactions.

**Done when:** the owner can filter transactions, edit categories, and inspect monthly category totals; edits survive sync; totals reconcile with the stated spending rules; filters and exclusions are visible; large histories remain usable.

- [ ] Design it (spec): `/architect spending investigation`

## Slice 4: Stay within a plan

### 8. Monthly category budgets · planned · needs a decision

Add monthly category limits to the proven spending totals. Keep budget entry and progress understandable before introducing AI proposals.

**Done when:** the owner can create and change a category's monthly budget, see exact spent and remaining values with over or under status, and move between months; zero, absent, and exceeded budgets are distinct; there is no rollover or double counting.

- [ ] Design it (spec): `/architect monthly category budgets`

## Slice 5: Find repeat charges

### 9. Recurring charge suggestions · planned · needs a decision

Suggest likely subscriptions and other recurring charges from transaction history. Present evidence rather than claiming certainty.

**Done when:** suggestions show supporting charges, estimated cadence and amount, and history limits; the owner can confirm or dismiss them and keep that choice after sync; irregular amounts and insufficient history are handled without cancellation actions or notifications.

- [ ] Design it (spec): `/architect recurring charge suggestions`

## Slice 6: Ask about finances

### 10. Read only finance chat · planned · needs a decision

Answer spending and budget questions using a small set of aggregate tools. Keep answers grounded in known records and keep model access separate from application authority.

**Done when:** chat answers supported questions with period and freshness context, declines unsupported claims, validates tool inputs and outputs, and resists instructions embedded in financial text; only minimal aggregates leave the machine; no raw transaction descriptions, account identifiers, SQL, secrets, or writable tools reach the model; usage is visible and a configurable cost limit has explicit enforcement and failure behavior.

- [ ] Design it (spec): `/architect read only finance chat`

## Slice 7: Make answers visual

### 11. Generated finance views · planned · needs a decision

Let chat responses request approved charts, tables, and cards. Generated UI means validated view descriptions, not arbitrary executable model code.

**Done when:** supported questions produce accessible charts, tables, or cards whose values match validated tool results; labels include units and periods; invalid, misleading, or unsupported view requests safely fall back to a plain answer; model content cannot execute code or load arbitrary resources.

- [ ] Design it (spec): `/architect generated finance views`

## Slice 8: Propose, then confirm

### 12. Confirmed budget proposals · planned · needs a decision

Let the copilot suggest budget changes while the owner keeps control. Reuse the manual budget rules rather than granting write tools to the model.

**Done when:** a proposal shows the exact month, category, old amount, and new amount; no write occurs before an explicit owner confirmation; application validation and authorization run again at confirmation; cancellation, stale proposals, retries, and repeated clicks cannot produce unintended changes.

- [ ] Design it (spec): `/architect confirmed budget proposals`

## Slice 9: Recover and finish v1

### 13. Recovery and v1 readiness · planned · needs a decision

Prove the app can recover and be run again from its instructions. Consolidate readiness evidence without delaying basic tests or error handling until this phase.

**Done when:** a documented backup script and restore exercise recover financial records and the required token key material safely; the README covers local setup, Sandbox use, sync, AI limits, and recovery; money math and tool input regression tests pass; critical empty, failure, inaccessible service, and restart paths are verified without leaking secrets.

- [ ] Design it (spec): `/architect recovery and v1 readiness`

## Deferred

These ideas stay visible but are not queued for v1. Revisit their order after the core loop is useful.

### 14. Weekly AI review · planned · needs a decision

Summarize a week's spending and budget movement after interactive chat is trustworthy.

**Done when:** a review explains changes from validated aggregates and respects explicit consent and cost limits for any scheduled model use.

- [ ] Design it (spec): `/architect weekly AI review`

### 15. Anomaly alerts · planned · needs a decision

Surface unusual financial activity without overstating certainty.

**Done when:** alerts explain the unusual pattern, support dismissal, and use owner approved delivery and privacy rules.

- [ ] Design it (spec): `/architect anomaly alerts`

### 16. Savings goals · planned · needs a decision

Track progress toward savings targets once monthly budgeting is established.

**Done when:** goals show exact target, progress, and remaining values without counting the same funds toward incompatible commitments silently.

- [ ] Design it (spec): `/architect savings goals`

### 17. Debt payoff · planned · needs a decision

Help compare repayment plans beyond the current spending loop.

**Done when:** plans state rate and payment assumptions and produce testable payoff projections distinct from actual balances.

- [ ] Design it (spec): `/architect debt payoff`

### 18. Investments · planned · needs a decision

Add investment understanding only after spending and budgeting are solid.

**Done when:** holdings and valuation dates are clear, and investment performance is not confused with cash flow or duplicated in net worth.

- [ ] Design it (spec): `/architect investments`

## Legend and maintenance

`planned` means queued, `in-progress` means partial, `done` means built and verified through this workflow, and `existing` means complete before it. `dropped` preserves a removed feature's history. Deferred rows are excluded from active work.

`needs a decision` means Needs spec: yes, start with `/architect`. Other rows have Needs spec: no and start with their listed command. A later feature should reuse prior specs and request only its new decisions, not redesign the whole app.

The first unticked box is the next command. On confirmed spec capture, `/architect` links the spec and expands buildable feature specs into design, build with two to five milestones, verify, and test. Atomic build tasks stay in buildable feature specs. Architecture decision specs are an exception: they record the chosen stack and executable contract without an atomic build plan. Their scope entry links the decision and carries scaffold, verify, and test commands. `/develop` derives scaffold tasks from that contract using the recorded build approach. Feature 1 selects the minimum test frameworks so its Beta checks can complete. Feature 2 starts with `/audit`, then expands conventions, formatting, lint, and tooling; once conventions are captured, add `/develop tooling` and its checks.

At Beta, `/check verify` proves behavior and `/test` supplies the test suite before a feature closes. An unratified assumed decision keeps a feature `in-progress`. No tier overrides are recommended now. `/sync` reconciles conventions and shipped work afterward.

Specs and code pointers appear only when they exist. Reconcile this file in place with bare `/scope` as the product ships. Keep deferred rows and preserve stable feature numbers. Split by area only when this file becomes difficult to scan.
