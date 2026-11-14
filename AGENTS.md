<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ledger

## Stack

One Next.js App Router app with strict TypeScript, Node 24 LTS, pnpm 12, React, and Tailwind CSS. Server database access uses Drizzle with `pg`, Postgres 18 in Docker Compose, and Zod for settings validation. Spec 0001 is the architecture authority. Drizzle Kit generates SQL migrations in `db/migrations/`; shadcn/ui primitives on Radix, `next-themes`, and Geist drive the app shell.

## Build approach

Tracer Bullet (prove a thin working path through storage, server, and UI, then deepen it).

## Commands

1. `pnpm install` installs dependencies.
2. `pnpm db:up` starts Postgres. `pnpm db:down` stops it without deleting its named volume.
3. `pnpm dev` starts the local development server.
4. `pnpm build` builds production output. `pnpm start` serves it.
5. `pnpm lint`, `pnpm typecheck`, and `pnpm test` run the current static checks and unit tests.
6. `pnpm test:e2e` runs Chromium browser tests. Playwright builds and starts its own production server. Port 3000 must be free.
7. `pnpm db:generate` writes a Drizzle Kit migration and `pnpm db:migrate` applies migrations. `pnpm db:provision-migration-role` and `pnpm db:create-token-key` set up the migration role and the token key file.
8. `pnpm db:test:up` and `pnpm db:test:down` manage the disposable test Postgres in `docker-compose.test.yml` for the `test/foundation.*` suites.
9. `pnpm test:e2e:design` runs the design review suite through `playwright.design.config.ts`.

## Rules

1. Keep routes and layouts in `src/app/`, shared presentation in `src/components/`, and private settings and database access in `src/server/`. Add `src/features/<feature>/` for domain rules and services only when needed.
2. Use the `@/*` import alias for `src/*`. Follow the existing TypeScript style, two space indentation, double quotes, semicolons, and named exports outside framework entry points.
3. Server modules import `server-only`. Client components must not import private settings or database clients. Return narrow display values, never raw errors or connection objects.
4. Keep browser access at `http://127.0.0.1:3000` and Postgres at `127.0.0.1:5432`. Host and Origin checks are not owner authentication. The app still has no sign in and no live financial data; the finance schema and services exist but no provider integration feeds them yet.
5. Keep `.env.local` private and ignored. Never log secrets or financial payloads. Never open network bindings, disable database authentication, or delete the data volume to fix a failure.
6. Keep the status check dynamic and uncached. A production build must work without live database credentials or a running database.
7. Place Vitest tests beside source as `*.test.ts` or `*.test.tsx`. Node is the default environment. UI tests select jsdom and use React Testing Library. Server tests mock `server-only`. Use controlled timers for timeout tests and restore mocks and timers.
8. Browser tests live in `e2e/*.spec.ts`. Keep keyboard access, visible focus, loading and error states, and narrow layouts usable. Test preferences are in `test-preferences.json`.
9. Run `pnpm check` for formatting, lint with zero warnings, strict type checks, and unit tests. Use `pnpm format` to apply Prettier formatting and `pnpm format:check` to check it. Formatter settings and exclusions live in `.devin/prettier.json` and `.devin/prettier.ignore`. Builds and browser tests remain separate. No Git hooks or CI are configured. Follow the recorded Beta workflow: develop, verify, then test.
10. Start each new feature on its own Git branch before making changes. Do not develop new features directly on `main`.

## Agent skills

Declined: optional Prettier skills and MCP integration, as recorded in spec 0002.
Declined: shadcn/ui, Drizzle Kit, Playwright, and axe agent skills, plus shadcn, Drizzle Kit, and Playwright MCP servers (offered after feature 4).

## Specs

Scope and workflow live in [docs/scope/scope.md](docs/scope/scope.md). The accepted architecture is [spec 0001](docs/specs/0001-architecture-runnable-scaffold/index.md). Read the relevant spec before changing behavior. Setup and troubleshooting live in [README.md](README.md).

## Context files

- [src/server/AGENTS.md](src/server/AGENTS.md) (Private settings, database lifecycle, and safe diagnostics)
- [src/features/finance/AGENTS.md](src/features/finance/AGENTS.md) (Finance domain rules, services, and money handling)
- [src/components/AGENTS.md](src/components/AGENTS.md) (Design system, app shell, nav registry, and shared display components)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
