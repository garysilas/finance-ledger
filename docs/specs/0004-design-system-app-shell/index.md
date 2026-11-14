# 0004. Design system and app shell

**Date**: 2026-11-13
**Status**: Accepted

## Summary

Ledger gets one calm, neutral visual language and a single app frame (the "shell") that every later screen lives inside. The shell is the shadcn.io inset sidebar on Radix primitives, themed with tweakcn CSS variables in light and dark, using Geist fonts. Feature 4 also builds the small shared pieces every finance screen needs (money and date display, status badges, loading, empty, and error states), but no finance screens. The current database status page moves into the shell at `/status`.

## Requirements

**User stories**:

- As the owner, I want one consistent, calm frame with clear navigation so that every later screen feels like the same trustworthy tool.
- As the owner, I want amounts, dates, and status shown the same way everywhere so that I can read a month without decoding each screen.
- As the builder of later features, I want accessible primitives and a token set ready so that each feature adds its screen, not its own design system.

**Acceptance criteria**:

1. **AC-1 (Shell)**: Every app route renders inside one shell built from the shadcn.io `sidebar-inset-variant` block on the Radix base. At 768 pixels wide and above, the sidebar is expanded or collapsed to icons. The collapse state survives reload without a visible jump. A labelled button and the block's keyboard shortcut toggle it.
2. **AC-2 (Narrow layout)**: Below 768 pixels, the sidebar becomes a sheet (a sliding panel) opened by a labelled menu button. Opening moves focus into the sheet, Escape closes it, and focus returns to the button. At 320 pixels wide, content needs no horizontal scrolling.
3. **AC-3 (Navigation)**: The nav lists only destinations that are built. Feature 4 ships one item, "System status". Items come from one typed registry that later features append to. The active item has `aria-current="page"` and a visible indicator that does not rely on color alone. Reserved order for later items: Overview (holding Transactions and Budgets as inner views), Accounts, then Chat if added, with System status last.
4. **AC-4 (Routes)**: `/` sends a temporary redirect to `/status` until feature 5 replaces it with Overview. `/status` shows the existing status content (same labels, messages, setup direction, and retry control) inside the shell, is dynamic, and returns `Cache-Control: no-store`. The existing Host and Origin checks apply to every app route, not only `/`.
5. **AC-5 (Health indicator)**: The sidebar footer shows database health as icon plus text from the existing fixed labels, linking to `/status`. In icon mode it shows the icon with an accessible name and a tooltip. It streams inside its own loading boundary, showing "Checking database" until the probe settles, so the shell and page content never wait on the probe. It refreshes on every full page load and whenever "Check again" refreshes the route. Client side navigation keeps the last value, because layouts do not rerender on navigation. Failures show the fixed label, never error text. One request runs at most one database probe, shared by the page and the indicator.
6. **AC-6 (Themes)**: Light and dark themes come from one semantic token set. The default follows the system setting. The owner can choose Light, Dark, or System from a dropdown menu in the sidebar footer, next to the health indicator, opened by a button with an accessible name. The choice persists in the browser, and the first paint never shows the wrong theme.
7. **AC-7 (Tokens)**: `src/app/globals.css` defines the full shadcn token set plus Ledger status tokens (`status-over`, `status-near`, `status-pending`, `status-stale`, each with a `-foreground` pair) for both themes, tuned from a tweakcn neutral base with a muted blue or indigo primary. Text pairs meet 4.5:1 contrast, and large text, focus rings, and control borders meet 3:1, in both themes. App code outside `globals.css` uses token utilities only, with no raw palette colors or hex values.
8. **AC-8 (Type and density)**: Geist Sans and Geist Mono load from the `geist` package's own `geist/font/sans` and `geist/font/mono` exports, with no font requests to external hosts at build or run time. Body text is 16 pixels. The type scale, spacing, and radius are the tokens defined in this spec. Shell and cards use comfortable spacing, and tables and lists use the compact row height. All money uses tabular numbers.
9. **AC-9 (Money display)**: `<Money>` formats signed bigint minor units exactly, through the existing currency scale registry, never converting to a JavaScript number and never rounding. The caller names a display context: `spending` (a positive total shows plain, a negative total shows a true minus sign U+2212 with a "net refund" label), `transaction` (an outflow shows plain, an inflow shows a leading plus), or `plain` (a true minus only when negative). USD shows `$` through an explicit USD branch. Other currencies show their ISO code so they are never mistaken for USD. An unknown currency renders "Amount unavailable". When a label applies, the full spoken form (for example "net refund of 40 dollars") is rendered in an `sr-only` span (read by screen readers, not shown).
10. **AC-10 (Dates and freshness)**: `<DateText>` shows a calendar date (YYYY-MM-DD) as written, with no time zone shift. `<MonthLabel>` shows a month as "November 2026". `<Freshness>` is a server component that shows a relative age ("Updated 3 hours ago") computed at render time, with no client ticking, plus the exact instant, in the given time zone, inside a `<time>` element. Every time zone dependent primitive requires an explicit `timeZone` input.
11. **AC-11 (State patterns)**: Shared loading (skeleton with `aria-busy`), empty (title, description, optional action), error (fixed safe message plus a retry control that announces completion), and stale data (freshness plus a warning) components exist. Each is keyboard usable, has visible focus, and respects reduced motion settings.
12. **AC-12 (Status badge)**: `<StatusBadge>` covers over budget, near limit, pending, stale, and excluded. Each always shows text and an icon, so its meaning never depends on color. Amounts themselves stay in the foreground color.
13. **AC-13 (Month URL contract)**: Pages that use a month read it from `?month=YYYY-MM`. A shared helper validates it with the existing month parser. An absent or invalid value resolves to the current month in the owner time zone. The helper reports `normalized: true` only for a present but invalid value (the page should rewrite the URL). An absent value reports `normalized: false`. The stepper control itself is left to feature 5.
14. **AC-14 (Style reference)**: A `/design` route renders every token, the type scale, money examples for each context, dates, status badges, and the state components, using static sample values only. It is absent from the nav and returns not found in production builds.
15. **AC-15 (Checks)**: Playwright with axe reports zero WCAG 2.2 AA violations on `/status` (production suite, `pnpm test:e2e`) and `/design` (development suite, `pnpm test:e2e:design`, using `playwright.design.config.ts`, which starts `pnpm dev` on port 3000), each in light, dark, and a 375 pixel viewport. The production suite asserts `/design` returns 404. Keyboard tests cover the skip link, sidebar navigation, sidebar toggle, sheet focus, and theme control. Cumulative layout shift (how much the page jumps while loading) on `/status`, measured by a `PerformanceObserver` for `layout-shift` entries registered before navigation, stays at or below 0.1. `pnpm build` still succeeds with no database, no secrets, and no network font fetch.

## Decision

**Chosen option**: Option 1, shadcn/ui on Radix, installed through the shadcn.io MCP, with the `sidebar-inset-variant` shell, tweakcn tuned tokens, `next-themes`, Geist from the `geist` package, `lucide-react` icons, and `@axe-core/playwright` for accessibility checks.

Visual references are the Mobbin screens for Origin (layout calm, section labels, restrained accent) and Copilot Money (budget framing and category progress rows). Follow Copilot's structure, not its red and green amount coloring.

**Implementation skills**: No community skill is installed. The connected `shadcnio` MCP is the source for component and block install commands, usage, and theming guidance. The connected `mobbin` MCP supplies the reference screens. The globally installed `frontend-design` skill may guide visual polish. Optional registry skills were reviewed and declined.

This spec governs scope feature 4. Confirmation ratifies its content. Status follows the feature lifecycle.

## Feature design

### Installed tools and placement

| Item                 | Choice                                                                                                      | Notes                                                                                                                         |
| :------------------- | :---------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| Component system     | shadcn/ui, Radix base                                                                                       | `components.json` with style and base color from the shadcn.io preset, `cssVariables: true`, Tailwind 4, RSC on.              |
| Aliases              | `components: @/components`, `ui: @/components/ui`, `utils: @/components/utils`, `hooks: @/components/hooks` | Keeps shared presentation in `src/components/` per rule 1. No new top level folder.                                           |
| Shell                | shadcn.io Pro block `sidebar-inset-variant` (Radix)                                                         | Uses avatar, badge, button, empty, guides, sidebar. Drop the avatar and demo issue content; keep the structure.               |
| Theme switching      | `next-themes`                                                                                               | `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. `<html suppressHydrationWarning>`. |
| Fonts                | `geist` package, `GeistSans` from `geist/font/sans` and `GeistMono` from `geist/font/mono`                  | Apply each `.variable` on `<html>`. Map to `--font-sans` and `--font-mono` in `@theme inline`. No hand written font paths.    |
| Icons                | `lucide-react`                                                                                              | Required by the block. Icons next to text are `aria-hidden`.                                                                  |
| Accessibility checks | `@axe-core/playwright` (dev)                                                                                | Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.                                                                  |

Pin each new dependency to an exact version published at least 7 days before install, matching the exact pins in `package.json`.

**Pro block install rule**: the install URL from the shadcn.io MCP embeds the owner's personal token. `/develop` gets the command from `get_block` at build time and runs it once. The URL must never appear in specs, scripts, `components.json` registries, commits, or logs. Commit the generated component source only.

### Route and file layout

| Path                                                     | Purpose                                                                                                                          |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`                                     | Root: fonts, `<html lang="en" suppressHydrationWarning>`, `ThemeProvider`, metadata.                                             |
| `src/app/(app)/layout.tsx`                               | Shell: `SidebarProvider` (default open read from the block's sidebar cookie), sidebar, inset content area, skip link to `#main`. |
| `src/app/(app)/status/page.tsx`                          | The moved status page. `dynamic = "force-dynamic"`, `runtime = "nodejs"`.                                                        |
| `src/app/page.tsx`                                       | `redirect("/status")` (temporary). Feature 5 replaces it.                                                                        |
| `src/app/(app)/error.tsx`, `src/app/(app)/not-found.tsx` | Shell level error and not found using the shared state components. The existing safe error logging stays.                        |
| `src/app/error.tsx`                                      | Kept as the root fallback for errors above the shell group. Restyled with tokens only.                                           |
| `next.config.ts`                                         | The `no-store` header rule changes its `source` from `/` to `/status`.                                                           |
| `src/proxy.ts`                                           | `matcher: "/((?!_next/static\|_next/image\|favicon.ico).*)"`, so Host and Origin checks cover every app route.                   |
| `playwright.design.config.ts`                            | Development suite for `/design`: `webServer` runs `pnpm dev` at `http://127.0.0.1:3000`. Script `test:e2e:design`.               |
| `src/app/design/page.tsx`                                | Style reference, outside the shell group, with `notFound()` when `process.env.NODE_ENV === "production"`.                        |
| `src/components/shell/`                                  | `app-sidebar.tsx`, `nav-items.ts` (the registry), `health-indicator.tsx`, `theme-control.tsx`.                                   |
| `src/components/finance/`                                | `money.tsx`, `date-text.tsx`, `month-label.tsx`, `freshness.tsx`, `status-badge.tsx`.                                            |
| `src/components/states/`                                 | `loading-state.tsx`, `empty-state.tsx`, `error-state.tsx`, `stale-notice.tsx`.                                                   |
| `src/features/finance/format.ts`                         | Pure `formatMoney` and date formatting, beside `money.ts` and `dates.ts`. No `server-only`.                                      |
| `src/features/finance/month-param.ts`                    | `resolveMonthParam`. Pure.                                                                                                       |

`retry-button.tsx` is restyled with tokens and reused by `error-state.tsx`.

**Shell content**: the sidebar header shows the "Ledger" wordmark as text, linking to `/`. The sidebar body holds the nav registry groups. The sidebar footer holds the health indicator, then the theme control. The inset panel holds `<main id="main">` with the page.

**One probe per request**: `checkDatabaseStatus` is wrapped with React `cache()` in `src/server/status.ts`, so the status page and the footer indicator share one probe and one log line per request.

**Dynamic rendering**: reading the sidebar cookie in `(app)/layout.tsx` makes every route in the shell group render per request. This is accepted. Finance pages are dynamic anyway, and a static page added later must live outside the group or drop the cookie read.

**Status badge icons** (lucide): over `CircleAlert`, near `TriangleAlert`, pending `Clock`, stale `History`, excluded `CircleSlash`. Health: available `CircleCheck`, configuration needed `Settings`, unavailable `CircleX`, checking `LoaderCircle` (spin only under `motion-safe:`).

### Tokens

Start from the shadcn.io neutral theme scaffold (from the MCP `get_guide` styling section), tune it in tweakcn, and paste the result into `globals.css`. The structure is fixed here. The exact OKLCH values are the owner's tweakcn output, and they must pass AC-7.

1. **Surfaces**: `background`, `card`, `popover`, `sidebar`, `muted`, `accent`, all neutral, with the sidebar tint slightly darker than `background` so the inset panel reads as raised (as in the block).
2. **Primary**: muted blue or indigo. Used for focus ring (`ring`, `sidebar-ring`), active nav, and primary buttons only.
3. **Destructive**: red, for destructive actions and invalid inputs.
4. **Status** (new): `status-over` red family, `status-near` amber, `status-pending` blue gray, `status-stale` neutral with amber foreground. Each has a `-foreground` pair, exposed through `@theme inline` as `--color-status-*`.
5. **Charts**: keep `chart-1` through `chart-5`, tuned so none equals a status color. Chart libraries are chosen by features 7 and 11.
6. **Radius**: `--radius: 0.625rem` with the derived scale from the guide.
7. **Type scale** (Tailwind steps): page title `text-2xl font-semibold`, section title `text-lg font-medium`, body `text-base`, secondary `text-sm text-muted-foreground`, caption and section labels `text-xs uppercase tracking-wide text-muted-foreground`. Key figures `text-3xl font-semibold tabular-nums`.
8. **Density**: shell padding `p-4` to `p-6`, card padding `p-4` to `p-6`, gaps `gap-4` to `gap-6`. Compact rows are `h-9` with `text-sm`.
9. **Focus**: every focusable element shows a 2 pixel ring in `ring` with offset, from the shadcn defaults. Never remove outlines without a replacement.
10. **Motion**: shadcn transitions only. Wrap any added animation in `motion-safe:`.

### Interface surface

No HTTP API or server action is added. The surfaces are routes and component contracts.

| Surface                                 | Kind                   | Key inputs                                                                             | Key outputs                                                                                                       | Auth                                      | Key errors                                                                                              |
| :-------------------------------------- | :--------------------- | :------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `GET /`                                 | route                  | none                                                                                   | 307 to `/status`                                                                                                  | none (local only; Host and Origin checks) | 400 bad Host, 403 cross origin                                                                          |
| `GET /status`                           | route                  | none                                                                                   | shell plus status section, `no-store`                                                                             | as above                                  | probe failures render fixed labels                                                                      |
| `GET /design`                           | route                  | none                                                                                   | style reference (development); 404 (production)                                                                   | as above                                  | none                                                                                                    |
| `formatMoney(units, currency, context)` | pure function          | `units: bigint`, `currency: string`, `context: "spending" \| "transaction" \| "plain"` | `{ ok: true, text, srText, label? }` (`srText` is the full spoken form for the `sr-only` span) or `{ ok: false }` | n/a                                       | unknown currency returns failure                                                                        |
| `<Money>`                               | component              | `units`, `currency`, `context`, optional `className`                                   | `<span class="tabular-nums">` with visible text, label when present                                               | n/a                                       | failure renders "Amount unavailable"                                                                    |
| `<DateText date>`                       | component              | `date: "YYYY-MM-DD"`                                                                   | "Nov 13, 2026" in `<time dateTime>`                                                                               | n/a                                       | invalid date renders "Date unavailable"                                                                 |
| `<MonthLabel month>`                    | component              | `month: "YYYY-MM"`                                                                     | "November 2026"                                                                                                   | n/a                                       | invalid renders "Month unavailable"                                                                     |
| `<Freshness at timeZone now?>`          | component              | `at: ISO instant`, `timeZone: string`, optional `now`                                  | relative text plus exact instant                                                                                  | n/a                                       | missing `at` renders "Never updated"                                                                    |
| `<StatusBadge status>`                  | component              | `"over" \| "near" \| "pending" \| "stale" \| "excluded"`, optional `label`             | icon plus text                                                                                                    | n/a                                       | n/a                                                                                                     |
| `resolveMonthParam(raw, now, timeZone)` | pure function          | `raw: string \| string[] \| undefined`, `now: Date`, `timeZone: string`                | `{ month: "YYYY-MM", normalized: boolean }`                                                                       | n/a                                       | present but invalid input gives current month with `normalized: true`; absent gives `normalized: false` |
| `navItems`                              | typed array            | `{ href, label, icon, match: "exact" \| "prefix", group: "primary" \| "system" }`      | sidebar entries                                                                                                   | n/a                                       | n/a                                                                                                     |
| Health indicator                        | async server component | none (calls the cached `checkDatabaseStatus`)                                          | label, icon, link                                                                                                 | n/a                                       | any outcome maps to fixed label                                                                         |
| Theme control                           | client component       | none                                                                                   | dropdown with Light, Dark, System; button named "Theme"                                                           | n/a                                       | before mount, renders the button without a checked item                                                 |

### Value sourcing

| Action                      | Value produced or displayed | Source                                                                                                                                                                                                                                                                     |
| :-------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money display               | digits and decimal position | `units` input and `currencyScale(currency)` in `money.ts` (spec 0003)                                                                                                                                                                                                      |
| Money display               | sign and label              | `context` input, decided by the caller; rules in AC-9                                                                                                                                                                                                                      |
| Money display               | symbol or code              | explicit USD branch with `currencyDisplay: "narrowSymbol"` (`$`); every other currency uses `currencyDisplay: "code"`. Both use `Intl.NumberFormat("en-US", { style: "currency", minimumFractionDigits: scale, maximumFractionDigits: scale })` on an exact decimal string |
| Date display                | calendar date text          | `date` input, formatted from its parts with a UTC formatter, so no zone shift                                                                                                                                                                                              |
| Freshness                   | relative age                | `at` input and `now` input (defaults to request time on the server)                                                                                                                                                                                                        |
| Freshness, month resolution | time zone                   | required `timeZone` input. Callers pass `owner.time_zone` (spec 0003, fixed to America/New_York). `/design` passes the literal sample value.                                                                                                                               |
| Health indicator            | status label                | cached `checkDatabaseStatus()` outcome mapped by the existing `STATE_LABEL`, moved to a shared module                                                                                                                                                                      |
| Layout shift check          | CLS value                   | sum of `layout-shift` entries without recent input, from a `PerformanceObserver` added by `page.addInitScript` before `goto("/status")`                                                                                                                                    |
| Nav active state            | which item is current       | `usePathname()` compared by the item's `match` rule                                                                                                                                                                                                                        |
| Sidebar collapse            | initial open state          | the block's sidebar cookie, read in the shell layout                                                                                                                                                                                                                       |
| Theme                       | active theme                | `next-themes` storage, else the system preference                                                                                                                                                                                                                          |
| Status badge                | text                        | fixed label per status ("Over budget", "Near limit", "Pending", "Stale", "Excluded"), overridable by `label`                                                                                                                                                               |
| `/design`                   | sample amounts, dates       | static constants in the page file, never database reads                                                                                                                                                                                                                    |

### Key invariants

1. No money value passes through a JavaScript `number`. Formatting builds an exact decimal string from bigint and scale.
2. Color never carries meaning alone. Every status has text and an icon, and amounts stay in the foreground color.
3. Nav shows only built destinations. No disabled or placeholder items.
4. The shell never awaits the database outside the health indicator's own loading boundary.
5. Client components import no `src/server/` module. The health indicator is a server component, and `STATE_LABEL` moves to a module with no server imports.
6. Raw palette classes (such as `zinc-*`) and hex colors appear only in `globals.css`.
7. `/design` never ships in production output as a reachable page.

### Security model

One local owner, no sign in yet (feature 5). All routes stay behind the existing Host and Origin checks. Widen the `proxy.ts` matcher from `/` to every app route, excluding `_next/static`, `_next/image`, and the favicon (literal pattern in the file layout table). The health indicator exposes only fixed labels. `/design` holds no real data. The shadcn.io token never enters the repository. Theme storage holds only `light`, `dark`, or `system`. No new environment variables.

### Configuration required

None. The shadcn.io token lives only in the owner's MCP configuration.

### Critical test scenarios

1. Happy path: visiting `/` lands on `/status` inside the shell, with sidebar, System status active, footer health, and status content. Verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**.
2. Narrow layout: at 375 pixels the menu button opens the sheet, focus enters, Escape closes and returns focus, and there is no horizontal scroll at 320 pixels. Verifies **AC-2**.
3. Slow probe: with a probe that never resolves (injected in a component test), the shell and page heading render and the footer shows "Checking database". Verifies **AC-5**.
4. Theme: with the system set to dark, the first paint is dark. Choosing Light persists across reload. axe passes in both themes. Verifies **AC-6**, **AC-7**, **AC-15**.
5. Money boundaries: zero, negative spending (net refund), inflow and outflow transaction rows, values beyond the safe integer range, JPY (scale 0), BHD (scale 3), CAD (shown as a code), and an unknown code. Verifies **AC-9**.
6. Dates: `2026-03-08` and `2026-11-01` around daylight saving changes render unchanged. Freshness in America/New_York. Invalid inputs show fallbacks. Verifies **AC-10**.
7. Month param: absent, valid, `2026-13`, `2026-1`, and an array value. Verifies **AC-13**.
8. Production: `/design` returns 404 from `pnpm start`. Build passes with no database and no network. The development suite renders `/design` and passes axe. Verifies **AC-14**, **AC-15**.
9. Security: requests with a wrong Host to `/status` and `/design` get 400. A cross origin request gets 403. Verifies **AC-4**.
10. Keyboard: Tab reaches the skip link first, then the sidebar items in order, the toggle, and the theme control, all with visible focus. Verifies **AC-11**, **AC-15**.
11. One probe: a server test renders the status page and the health indicator in one request and observes one probe call. Verifies **AC-5**.

## Build plan

Tracer Bullet: first prove one thin themed path, from shell through route to the real status probe, then deepen the tokens, primitives, and checks.

1. **Thin themed shell around the real status page.** Run shadcn init (Radix, aliases above), add Geist and `next-themes`, install the inset sidebar block through the MCP rule, create the `(app)` group with the nav registry and skip link, move the status page to `/status`, redirect `/`, move the `no-store` header rule to `/status`, widen the proxy matcher, wrap `checkDatabaseStatus` in `cache()`, and add the streamed footer health indicator. Update `e2e/status.spec.ts` for the new path. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-8**.
2. **Themes, tokens, and narrow layout.** Tune the tweakcn tokens with the owner, add the status tokens, wire the theme control, remove raw palette classes from app code, confirm the sheet behavior and 320 pixel reflow, and add axe scans in light, dark, and narrow viewports. Satisfies **AC-2**, **AC-6**, **AC-7**, **AC-15**.
3. **Finance display primitives and state patterns.** Build `formatMoney`, `<Money>`, `<DateText>`, `<MonthLabel>`, `<Freshness>`, `<StatusBadge>`, `resolveMonthParam`, and the loading, empty, error, and stale components, with unit tests beside each. Use them in the shell's error and not found pages. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**.
4. **Style reference and final checks.** Build `/design` with static samples, add `playwright.design.config.ts` and the `test:e2e:design` script with axe and keyboard tests for it, add the layout shift measurement, confirm the production 404 and the offline build, and update the README (routes, theme, `/design`). Satisfies **AC-14**, **AC-15**.

## Consequences

**Positive**:

- Later features add screens and nav items, not styling decisions. Money and status display is consistent by construction.
- Accessibility regressions surface in each feature's e2e run.
- Component source lives in the repo, so the owner can read and change it.

**Negative / tradeoffs**:

- The shell depends on a Pro block. Reinstalling or updating it needs the owner's shadcn.io access, and generated code must be reviewed for lint and format rules.
- Three runtime dependencies (`next-themes`, `geist`, `lucide-react`) plus Radix packages pulled in by shadcn, and one dev dependency.
- Exact token values depend on an owner tuning session in tweakcn, which is a manual step in build task 2.
- `/` stops showing status directly. The existing e2e test and README must change.
- The footer health indicator can be stale after client side navigation until a full load or "Check again".
- Every route in the shell group renders per request because of the sidebar cookie.
- `/design` needs its own development Playwright suite, run separately from the production suite (both use port 3000, so never at the same time).

**Neutral**:

- No schema or migration. No server action.
- Generated shadcn files follow Prettier and ESLint once formatted. Any lint rule they break is fixed in the file, not disabled globally.

## Follow-up

- [ ] `/sync`: record in root `AGENTS.md` the component aliases under `src/components/`, the token only color rule, the nav registry, the `/design` route, and the Pro block token rule.
- [ ] `/sync`: record declined registry skills (`shadcn-labs/snapcn` design-system, `fusengine` shadcn-theming) and the connected `shadcnio` and `mobbin` MCP servers under `## Agent skills`.
- [ ] Feature 5: build the page header and month stepper on the AC-13 contract, replace the `/` redirect with Overview, and add its nav item.
- [ ] Feature 10: decide whether Chat is a top level nav item or a panel opened from anywhere.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
