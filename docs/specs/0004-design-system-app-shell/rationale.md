# 0004. Design system and app shell: rationale

## Context

Ledger has one page, a database status check styled with hardcoded zinc colors, a system font stack, and a light theme only. Spec 0001 installed Tailwind 4 and left the component system, theme variables, and shell to this feature. The scope lists shadcn/ui and tweakcn as the owner's preferred tools, not as ratified decisions.

Every later feature (spending, accounts, budgets, chat, generated views) will add screens. Without a shared frame and token set, each one would invent its own spacing, colors, and money formatting. In a finance app that inconsistency is a correctness risk, not just a cosmetic one: a sign shown differently on two screens, or a red that means "outflow" on one and "over budget" on another, makes totals harder to trust.

The constraints are local only access behind Host and Origin checks, WCAG 2.2 AA, desktop first with usable narrow layouts, builds that work without a database, money as exact integers (spec 0003), and the scope rule against complete screens on fake data. The owner had no existing design source, so the visual direction was chosen during this conversation, with Mobbin finance screens as reference.

## Options considered

### Option 1: shadcn/ui on Radix, via shadcn.io, with the inset sidebar block

Copy accessible component source into the repo, theme it with CSS variables from tweakcn, and use the shadcn.io Pro `sidebar-inset-variant` block as the shell.

**Pros**: owned source, a proven accessibility base, the largest ecosystem and examples, native fit with Tailwind 4 and tweakcn, and MCP access to exact install and usage guidance.

**Cons**: a Pro block tied to the owner's account and token. Generated code must be brought in line with project lint and format rules.

### Option 2: shadcn/ui on Base UI

Same approach on shadcn.io's default base.

**Pros**: the newer primitive library from the Radix and MUI authors, and the default for shadcn.io.

**Cons**: younger and still changing its API, with fewer third party examples and less tweakcn coverage.

### Option 3: Hand built primitives on Tailwind only

**Pros**: no component dependencies and full control.

**Cons**: every dialog, menu, sheet, and tooltip needs its own focus and keyboard work and tests. That is the highest accessibility risk for a learning project.

### Option 4: A packaged component library (for example Mantine)

**Pros**: fast to start, with built in theming.

**Cons**: its own styling system competes with Tailwind, and customization happens through its API rather than owned code.

## Rationale

Option 1 meets the accessibility target with the least custom focus handling, matches the owner's preferred tools, and keeps the code readable for learning. Radix was chosen over Base UI because maturity and example coverage matter more than novelty for a lasting project. The owner selected the inset sidebar block specifically, and it fits the calm, panel on tint look of the Origin reference.

The calm neutral direction, neutral amounts, and status only color follow from the success goal: explain a month and trace totals. Color is reserved for state, so over budget stays legible and meaning never rests on color alone. Light and dark from one token set costs little now and a lot to retrofit. `next-themes` is the documented shadcn path and avoids a hand written pre paint script. Loading Geist from the `geist` package keeps builds able to run offline, which aligns with the rule that builds need no live services.

Feature 4 builds money, date, state, and badge primitives because every later screen needs them, and because exact bigint formatting is where display bugs would undermine spec 0003. Page header and month stepper components were left to feature 5, but the URL month contract is fixed now so features 5, 7, and 8 share one control. Navigation shows only built destinations, and `/` redirects to `/status`, so no placeholder screens appear. The dev only `/design` route gives axe and `/check verify` a real target without fake finance screens.

Moving status to `/status` exposed a gap: the proxy matcher covers only `/`. This spec widens it, so new routes keep the same Host and Origin protection.

## Discovery and evidence

### Owner decisions from the design conversation

| Dimension            | Decision                                                                                                                                                           |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design source        | No prior design. Direction chosen here, with Mobbin references.                                                                                                    |
| Top level nav (v1)   | Overview and Accounts. Transactions and Budgets nest inside Overview. Chat may become top level later.                                                             |
| Unbuilt destinations | Hidden until built.                                                                                                                                                |
| Status page          | Moves into the shell as `/status`, with a footer health indicator.                                                                                                 |
| Direction            | Calm, precise, neutral.                                                                                                                                            |
| Themes               | Light and dark, following the system, with a manual override.                                                                                                      |
| Components           | shadcn.io on Radix.                                                                                                                                                |
| Shell                | shadcn.io `sidebar-inset-variant` (Radix).                                                                                                                         |
| Theme source         | tweakcn, tuned by the owner from a neutral base.                                                                                                                   |
| References           | Mobbin: Origin, Copilot Money.                                                                                                                                     |
| Typeface             | Geist Sans and Geist Mono, from the `geist` package.                                                                                                               |
| Money color          | Neutral amounts, color only for status.                                                                                                                            |
| Density              | Comfortable default, compact tables.                                                                                                                               |
| Month state          | URL search param.                                                                                                                                                  |
| Accent               | Muted blue or indigo.                                                                                                                                              |
| Health               | Sidebar footer, streamed. Owner picked "on each navigation". Layouts do not rerender on navigation, so the accepted fix is refresh on full load and "Check again". |
| Initial routes       | `/` redirects to `/status`.                                                                                                                                        |
| Primitives           | Money and date display, state components, status badge.                                                                                                            |
| Theme toggle         | `next-themes`.                                                                                                                                                     |
| Accessibility checks | axe in Playwright.                                                                                                                                                 |
| Sign display         | Context labels, true minus only when needed.                                                                                                                       |
| Style route          | Dev only `/design`.                                                                                                                                                |
| Pro block            | Install through the MCP, never commit the tokenized URL.                                                                                                           |
| Agent skills         | Registry searched. Candidates declined; MCPs cover the need.                                                                                                       |

### Decisions made by the architect

1. Component aliases live under `src/components/` (`ui`, `utils`, `hooks`) to stay within rule 1 rather than adding `src/lib/`. Runner up: the shadcn default `@/lib/utils`.
2. Money formatting builds an exact decimal string and uses `Intl.NumberFormat` on that string, with the ISO code for non USD currencies. Runner up: manual grouping, which is more code with no gain.
3. Status tokens are added as new semantic variables instead of reusing `destructive` and chart colors, so status meaning stays independent of actions and charts.
4. Layout shift threshold of 0.1, the common "good" boundary, as the measurable performance check for the shell.
5. The breakpoint of 768 pixels follows the sidebar block's mobile hook rather than a custom value.
6. A skip link to `#main` is added to the shell, because a persistent sidebar puts many tab stops before content.

### Cross check resolutions

A read only cross check found these gaps. The owner approved the recommended fixes, now in `index.md`:

1. `/design` returns 404 in the production Playwright server, so its axe checks run in a separate development suite.
2. The health indicator refreshes on full load and "Check again", not on client navigation (layouts do not rerender). The runner up, a client call to a new `/api/health` route on each path change, was rejected because it adds an endpoint.
3. `checkDatabaseStatus` is wrapped in React `cache()` so one request probes once.
4. Theme control is a dropdown in the sidebar footer.
5. Fonts use the `geist` package's own exports rather than hand written `next/font/local` paths.
6. Exact `no-store` header source, proxy matcher pattern, kept root `error.tsx`, and sidebar wordmark are pinned.
7. `srText`, `normalized`, server only `<Freshness>`, the USD branch, badge icons, and the layout shift method are pinned.
8. The cookie read making the shell group dynamic is recorded as an accepted consequence.

### Mobbin reference screens

Recorded by app name. Mobbin screen links require the owner's account.

1. Origin web dashboard: muted sidebar with uppercase section labels, quiet cards, restrained accent.
2. Copilot Money web dashboard: "over by, of budgeted" framing and category progress rows.
