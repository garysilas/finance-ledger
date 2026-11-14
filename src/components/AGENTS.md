# Components (design system and app shell)

## Overview

Shared presentation for Ledger: shadcn/ui primitives on Radix, the app shell (sidebar, nav, health indicator, theme control), finance display components, and shared loading, empty, error, and stale states. Spec 0004 is the authority. Later features add screens and nav items here, not new styling decisions.

## Key files

| File                                                  | Owns                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `components.json` (repo root)                         | shadcn config: new-york style, neutral base, CSS variables, RSC, lucide icons, aliases below |
| `ui/`                                                 | Generated shadcn primitives (button, sidebar, sheet, dropdown menu, guides, and others)      |
| `utils.ts`                                            | `cn` helper, re-exported from the `cn` package                                               |
| `hooks/use-is-mobile.tsx`                             | `useIsMobile`, matched to Tailwind `md` (768px), `false` on the server                       |
| `shell/nav-items.ts`                                  | The one nav registry every sidebar destination comes from                                    |
| `shell/app-sidebar.tsx`                               | Sidebar: wordmark, nav, footer health indicator, theme control                               |
| `shell/health-indicator.tsx`                          | Async server component; maps the cached `checkDatabaseStatus` outcome to a fixed label       |
| `shell/theme-provider.tsx`, `shell/theme-control.tsx` | `next-themes` wrapper and the Light, Dark, System menu                                       |
| `finance/`                                            | `Money`, `DateText`, `MonthLabel`, `Freshness`, `StatusBadge`                                |
| `states/`                                             | `LoadingState`, `EmptyState`, `ErrorState`, `StaleNotice`                                    |
| `status-labels.ts`                                    | Fixed database status labels and messages, safe for client and server                        |
| `retry-button.tsx`                                    | Retry control with a polite live region; `router.refresh()` by default                       |

## Conventions

- Import through the aliases: `@/components/ui`, `@/components/utils`, `@/components/hooks`. No new top level folder.
- Primitives use `tailwind-variants` (`tv`) for variants and `Slot` from the `radix-ui` package. Merge classes with `cn` and accept a `className` prop.
- Colors come from tokens only (`bg-card`, `text-muted-foreground`, `bg-status-over`, and so on). Raw palette classes such as `zinc-*` and hex colors live only in `src/app/globals.css`.
- Color never carries meaning alone. Every status shows text and an icon. Amounts stay in the foreground color. Icons next to text get `aria-hidden="true"`.
- Show money only through `<Money>` with bigint minor units and a `context` (`spending`, `transaction`, `plain`). Formatting lives in `@/features/finance/format`; never pass money through a `number`.
- Dates, months, and freshness go through `DateText`, `MonthLabel`, and `Freshness`. `Freshness` and `StaleNotice` need an explicit `timeZone` (callers pass the owner time zone).
- Each finance component renders a fixed fallback on bad input ("Amount unavailable", "Date unavailable", "Month unavailable", "Never updated"). Error surfaces show fixed, safe text, never raw error messages.
- Nav lists only built destinations, no disabled or placeholder items. Add a page by appending to `navItems` (`group: "primary" | "system"`, `match: "exact" | "prefix"`).
- Client components (`"use client"`) never import `src/server/`. Labels a client needs go in a module with no server imports, like `status-labels.ts`.
- Follow the type scale and density in spec 0004 (page title `text-2xl font-semibold`, key figures `text-3xl font-semibold tabular-nums`, compact rows `h-9 text-sm`). Wrap any added animation in `motion-safe:`. Never remove focus outlines without a replacement.
- Tests sit beside each file as `*.test.tsx` with jsdom and React Testing Library. Tests that render the health indicator mock `server-only`.

## Gotchas

- The health indicator awaits the database. It must stay inside its own `Suspense` boundary in the sidebar footer, so the shell and page never wait on the probe. `checkDatabaseStatus` is wrapped in React `cache()`, so the status page and the indicator share one probe per request.
- Theme and viewport hooks render a neutral first pass (`useSyncExternalStore` with a server snapshot) to avoid hydration mismatches. Keep that pattern when adding client state that depends on the browser.
- The shell came from a shadcn.io Pro block. Its install URL embeds the owner's personal token: never put it in specs, scripts, `components.json` registries, commits, or logs. Commit generated source only.
- Generated shadcn files must pass Prettier and ESLint after `pnpm format`. Fix a broken rule in the file; never disable it globally.
- The visual reference lives at `/design` (`src/app/design/page.tsx`), uses static sample values, and 404s in production. Check it with `pnpm test:e2e:design` (never at the same time as `pnpm test:e2e`, both use port 3000).

## Related specs

- [Spec 0004: Design system and app shell](../../docs/specs/0004-design-system-app-shell/index.md)
- [Spec 0003: Financial data foundation](../../docs/specs/0003-financial-data-foundation/index.md) (money units and owner time zone)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
