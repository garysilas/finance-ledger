# 0001. Architecture and runnable scaffold

**Date**: 2026-11-08
**Status**: Accepted

## Summary

Ledger will be one Next.js application running on this Mac, with Postgres in Docker. The browser uses the local server, which owns database access and secrets. The first runnable proof shows a real database status without creating financial tables or installing future integrations.

## Decision

**Chosen option**: One application with feature services and server modules. Use Next.js App Router, strict TypeScript, Node 24 LTS, pnpm, Tailwind, Drizzle, the `pg` driver, and Postgres 18. This fits one local owner without separate application servers or browser data replication (basis: scope feature 1, Next.js self hosting documentation, Drizzle PostgreSQL migration documentation).

This is the architecture decision for scope feature 1. Confirmation ratifies its content. Status remains `Proposed` until implementation begins, then follows the feature lifecycle.

**Implementation skills**: No new community skills are installed. The owner selected `supabase-postgres-best-practices` from `supabase/agent-skills` as an optional setup task outside feature 1's delivery requirements. Review the source and supporting references before installation. Installation must use `.devin/skills/` and follow Devin configuration instructions. Verify the Vercel React skill source and ask before installing it. Skill availability, installation, and source investigation must not block the scaffold.

## Proposed stack

| Layer | Choice | Reason |
| :--- | :--- | :--- |
| Application | One Next.js App Router application | Keep UI and server together with internal separation. |
| Language | Strict TypeScript | Catch incompatible types before execution. Runtime validation remains necessary. |
| Runtime | Node 24 LTS, Node runtime for database code | Use an established supported line and ordinary database connections. |
| Package manager | pnpm | Use one lockfile and explicit dependency ownership. |
| Styling | Tailwind | Establish the preferred CSS foundation without choosing the later visual system. |
| Database | Postgres 18 in Docker Compose | Keep durable data local in a named volume. |
| Database access | Drizzle with `pg` | Typed access with an ordinary Postgres driver. |
| Schema changes | Drizzle Kit generated SQL, reviewed and explicitly applied | Preserve a migration history without startup schema changes. |
| Configuration | Ignored local environment file, Zod validation | Validate settings while keeping secrets outside tracked files. |
| Server interface | Direct service calls from Server Components | Avoid an internal HTTP API for server rendered reads. |
| Later interfaces | Server Actions for application writes, Route Handlers for external callbacks | Preserve distinct application and external request boundaries. |
| Diagnostics | Local safe console events | Record useful failures without external telemetry or payload logging. |
| Initial checks | Production build, strict typecheck, Vitest, and Playwright with Chromium | Verify pure logic and the real browser path now. Feature 2 expands broader tooling. |

### Version policy

During build setup, select compatible stable releases and record exact package versions, pnpm version, Node patch, and the Postgres image digest. Prefer releases published at least seven days earlier. Do not use preview packages, floating `latest` values, or unbounded ranges. Commit the lockfile when commits are later requested. Do not change security policies to make installation succeed.

Node 24 and Postgres 18 are chosen release lines. Next.js and Tailwind major selection is explicitly delegated to build setup, with owner approval before installation. Use official release support information and the selected Next.js package's peer requirements as the compatibility authority. Select React to match those peer requirements, not as an independent architecture choice. Record exact versions after approval. Verify support and compatibility at installation. Never silently replace a chosen line.

### Local operation

Run Next.js directly on the host. Docker Compose runs only Postgres. The owner operates both processes. There is no cloud deployment, external product analytics, or container orchestration service.

Use `http://127.0.0.1:3000` as the canonical browser origin. Bind development and production application servers to `127.0.0.1`. Publish Postgres only on `127.0.0.1:5432`. A port conflict produces an actionable failure, not an automatic move to another origin. Do not configure tunnels or trust forwarded host headers.

Postgres is the source of truth. Core financial views will work without internet while the local server and database are running. This does not promise browser operation when the server is stopped. There is no service worker, browser database, or reconciliation protocol in this feature.

### Code boundaries

Use `src/app/` for routes, layouts, and thin transport code. Use `src/features/<feature>/` for application services and domain rules as features arrive. Use `src/server/` for configuration, database access, and later provider adapters. Use `src/components/` only for shared presentation when needed. Do not generate unused feature folders or generic repository abstractions.

Server modules use an explicit server only import boundary. Browser code never imports database clients, private configuration, or provider adapters. Services return narrow display values, not database connection objects or raw errors. Keep the probe dynamic at request time. A production build must not need a running database or live service credentials.

Use one bounded `pg` pool per application process, reused during development reloads, with at most five connections. Set finite connection acquisition and query limits within the three second probe budget. A timed out query must be cancelled or its connection discarded, not left working after a success shaped response. Release acquired resources on every path and handle pool errors without leaking raw error details.

### Scaffold surface

The only application page is `GET /`. It displays Ledger's name, a short explanation that this is the local scaffold, database state, the last check time, and a retry control. No dashboard, fake balances, financial input, sign in screen, or visual design system is included.

| Surface | Inputs | Output | Access and errors |
| :--- | :--- | :--- | :--- |
| `GET /` | Valid canonical Host, no user parameters | Server rendered status page, HTTP 200 for both database available and unavailable | Local scaffold only. Invalid Host returns 400. A present foreign Origin returns 403. Requests without Origin are allowed for ordinary navigation. |
| Retry | Keyboard or pointer activation | Fresh request for `/`, visible loading state, then a new result | No data mutation, no automatic polling or hidden external request. |

A successful probe executes `SELECT 1` through Drizzle and `pg`. Retain Drizzle now to verify the exact selected database access stack. Defer Drizzle Kit installation and configuration until feature 3 introduces real migrations.

Send `Cache-Control: no-store` for `/`. Retry issues a fresh `GET /` without relying on client navigation caches. Ignore unknown query parameters and never use them as configuration or query inputs. Framework navigation parameters retain their framework meaning but never change the probe. Each completed check gets a new timestamp.

Use the following literal page copy: heading `Ledger`, explanation `Local scaffold. This page checks the connection to your local database.`, timestamp label `Last checked (UTC)`, retry label `Check again`, loading text `Checking database connection...`, and setup direction `See local setup and troubleshooting in README.md.`

| Condition | HTTP behavior | Displayed state | Fixed message | Outcome code | Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Expected query result | 200 | Available | `The local database is available.` | `DB_OK` | Check again. |
| Missing, malformed, or inconsistent settings | 200 | Configuration needed | `Local database settings need attention.` | `CONFIG_INVALID` | Setup direction, then check again after correcting settings and restarting the app. |
| Connection refused, network failure, or connection closure | 200 | Unavailable | `Cannot connect to the local database.` | `DB_CONNECTION_FAILED` | Setup direction and check again. |
| Server reports invalid authorization or password | 200 | Unavailable | `Database sign in failed. Check your local credentials.` | `DB_AUTH_FAILED` | Setup direction, correct credentials, restart the app if settings changed, then check again. |
| Connection acquisition deadline expires | 200 | Unavailable | `The database connection check timed out.` | `DB_ACQUIRE_TIMEOUT` | Check again. |
| Query deadline or remaining whole probe budget expires after acquisition | 200 | Unavailable | `The database query check timed out.` | `DB_QUERY_TIMEOUT` | Check again. |
| Other query failure or unexpected result | 200 | Unavailable | `The database check could not complete.` | `DB_QUERY_FAILED` | Setup direction and check again. |
| Unexpected page failure | Generic framework error boundary, HTTP 500 if headers are not sent, otherwise retain the existing streamed status | Page error | `Ledger could not show the status page.` | `PAGE_FAILED` | Safe reload control labelled `Try again`. |

Prefer a recognized server authentication error over a generic connection error. Classify timeouts by the phase active when the deadline expires. Do not expose raw error text. Missing Docker and port conflicts are troubleshooting possibilities, not conclusions inferred from a failed database connection.

Host comparison includes the configured port. Origin comparison uses the exact canonical origin. Reject malformed or duplicate Host values. Do not enable permissive CORS. These checks are an extra browser request boundary, not proof of owner identity or protection from other local processes.

The status page has semantic headings, readable contrast, visible keyboard focus, a labelled retry control, and text status rather than color alone. Announce retry completion without repeatedly interrupting assistive technology. It must remain usable at a 320 CSS pixel viewport and normal desktop widths. Use local assets and a system font, with no runtime font or asset download.

| Value produced | Source |
| :--- | :--- |
| Application name and explanation | Static scaffold copy in this spec. |
| Database state | Current probe outcome or validated configuration failure. Never cached or fabricated. |
| Last check time | Server clock when the probe or configuration check completes, serialized as UTC ISO 8601 and labelled UTC. This is diagnostic time, not the future finance time zone. |
| Failure explanation | Fixed allowlisted messages selected by safe outcome code. |
| Diagnostic duration | Monotonic elapsed time for that check, not financial data. |
| Retry state | The current navigation or refresh lifecycle. |

### Configuration and durable storage

Use `.env.local` as the private local settings file, with a tracked `.env.example` containing placeholders only. Compose must explicitly load that file. Protect the private file with owner read and write permissions. All settings below are required at runtime, except the bootstrap password is needed only by database operations, not by Next.js. Never use `NEXT_PUBLIC_` settings for them.

| Setting | Source and validation |
| :--- | :--- |
| `POSTGRES_DB` | Owner setup value, default example `ledger`. Require an identifier matching `^[a-z][a-z0-9_]{0,62}$`. |
| `POSTGRES_USER` | Required privileged bootstrap login for the official image, example `ledger_admin`. Same identifier rule. Never the application login. |
| `POSTGRES_PASSWORD` | Required owner supplied random bootstrap password, distinct from the application password. No tracked default or production credential reuse. |
| `LEDGER_DB_USER` | Required restricted application login, example `ledger_app`. Same identifier rule, distinct from `POSTGRES_USER`. |
| `LEDGER_DB_PASSWORD` | Required owner supplied random application password. No tracked default or production credential reuse. |
| `DATABASE_URL` | Required application URL. Scheme must be `postgresql:`, hostname exactly `127.0.0.1`, explicit port exactly `5432`, and path exactly one database identifier matching `POSTGRES_DB`. Require username and password, no query options or fragment. Decoded username and password must match `LEDGER_DB_USER` and `LEDGER_DB_PASSWORD`. |

Use explicit matching validation rather than silent credential generation. The owner supplies the values once in the local file and constructs the URL with correctly encoded credential components using the documented setup instructions. Zod based server validation checks URL structure and equality against the application settings without printing values. Container initialization reads the same file through Compose and creates the restricted login with that same application username and password. Never compare the application URL against the privileged bootstrap credentials.

Create the application login during empty volume initialization. Give it LOGIN and CONNECT to the Ledger database, without superuser, database creation, role creation, replication, schema creation, or table creation authority. Use the bootstrap role only for initialization and later explicit migration operations, never in the app pool. Feature 3 grants only the schema and data privileges the real application needs. Initialization must safely quote identifiers and bind or safely quote secret values, with no secret output. Do not mount the Docker socket into the app.

The origin and ports are fixed constants. Other hosts, aliases, IPv6, implicit ports, and extra URL options are invalid for this scaffold. The build needs no database URL. Runtime validation reports missing or malformed settings safely. No Plaid, OpenAI, owner session, or token encryption settings are required yet.

Use a named volume with the data directory appropriate for the selected official Postgres 18 image. Ordinary stop and restart retain data. Never make volume deletion part of routine reset or shutdown commands. Database bootstrap happens only for an empty volume. Changing environment credentials does not automatically update an existing database role. Explain this failure mode rather than suggesting data deletion.

No application entities, primary keys, relationships, or migrations are introduced. The database probe is deliberately without persistent writes. The migration policy is established now, with schema and actual migration commands finalized alongside feature 3's real tables. Do not generate an empty migration as proof of progress.

### Security and future boundaries

This scaffold has no owner sign in and no private finance data. Owner authentication and authorization must be designed and built before feature 5 exposes financial records. Do not treat the status page as an authenticated application shell.

Financial records stay local. Future Plaid tokens must be encrypted at rest, remain on the server, and stay out of logs and model input. Future model tools must be typed, Zod validated, and read only. Budget writes require a separate explicit owner confirmation. These constraints are binding, but provider clients and cryptographic implementation are outside this scaffold (basis: scope shared security boundaries).

Use no queue, job scheduler, search service, object store, external error tracker, or AI package now. There is no financial processing, real bank connection, public registration, or payment processing in this feature. No regulatory certification is claimed.

### Failure handling and diagnostics

Safe diagnostic events use `ledger.database_probe` for completed database or configuration checks and `ledger.page_failed` for unexpected page failures. Fields are only `event`, `outcome`, and `durationMs`. Use the outcome codes from the table above and monotonic elapsed milliseconds for duration. Page failure duration is measured from the start of page handling, or null if the error boundary has no timing source. Request rejection responses use static messages and no request value logging. Do not log raw exception objects, SQL parameters, connection strings, environment contents, request bodies, or financial payloads. No external telemetry is introduced. Disable optional framework telemetry during setup through its supported mechanism.

A stopped database must not prevent the page from loading an unavailable result. After the database restarts, retry must recover without restarting Next.js. Missing Docker, port conflicts, missing settings, and authentication failure need safe setup guidance. Never fix these by opening network bindings, disabling database authentication, or deleting volumes.

Initialize Git during the build with ignore rules covering environment files, dependency folders, build output, local logs, and database dumps. Do not commit or push automatically. The repo currently has no Git metadata, so no team freshness check was possible during design.

### Delivery and verification contract

Follow the scope's Tracer Bullet approach: first prove a real browser to server to database status path, then deepen failure behavior, security boundaries, and repeatable operation. Do not lead with a polished UI over placeholder status. This architecture record has no separate atomic build plan. `/develop` derives scaffold tasks from this contract.

The scaffold must start locally, pass a production build and strict typecheck, and serve the production build on the same loopback origin. Verify the live database path, stopped database result within the three second probe budget, retry recovery, missing and invalid configuration, invalid Host and foreign Origin rejection, and the absence of secrets in HTML, client bundles, responses, and diagnostics. Account separately for framework startup and compilation time when measuring the probe budget.

Verify build success with Postgres stopped and no live credentials. Confirm named volume retention across ordinary container restart. Check keyboard retry, focus, loading, narrow layout, and a safe page error boundary. No external service may be contacted as part of the status probe. Framework and image downloads during installation are not offline runtime behavior.

Use test fault injection to exercise connection acquisition timeout and query timeout independently, including the case where work completes after the deadline. Verify that resources are released or discarded, no success is returned after timeout, pending acquisition cannot leak a later connection, and a later retry succeeds. Test database credential mismatch, invalid URL options, restricted role privileges, and changed database state across fresh retries. Injection is a test dependency seam, never a public request parameter or runtime bypass.

Feature 1 uses Vitest in the Node environment for configuration validation, outcome mapping, injected timeout failures, and resource cleanup. Use controlled timers and dependency seams for late acquisition and late query completion. Restore mocks and timers after each test. Use Playwright with Chromium for real page rendering, keyboard retry, fresh timestamps, safe messages, request rejection, and narrow layouts. Run browser checks against a separately launched production build, with `reuseExistingServer: false`, not an arbitrary existing development server. Exact compatible stable test tool versions follow the same installation policy as other dependencies (basis: Vitest timer documentation and Playwright web server documentation checked during review resolution).

Browser and database integration checks use an explicitly named test Compose project and separate test volume and credentials, never the owner's application volume. Use the same fixed loopback ports and run sequentially with the ordinary app and database stopped by the owner. Fail on an occupied port rather than attaching to another process or stopping it automatically. Outage tests may stop and restart only their own test database. Do not delete volumes automatically. Test fixture writes, if needed to demonstrate retention or role restrictions, stay only in the isolated test database and do not introduce application tables. No runtime request parameter may enable fault injection.

Feature 2 owns formatting, broader lint policy, and later tooling expansion. The Beta workflow requires `/check verify` and `/test` before feature 1 closes. Manual runtime checks are not an automated suite.

### Operating instructions

Feature 1 implementation must create a minimal root `README.md`. It explains prerequisites, approved exact tool versions, secure random credential generation, URL encoding and matching, owner only file permissions, restricted role initialization, and loading `.env.local` for Compose. It gives development, production build, production start, typecheck, test, container startup, shutdown, and restart commands with explicit loopback addresses and ports.

Include troubleshooting for stopped Docker, occupied ports, invalid settings, inconsistent credentials, database authentication failure, and an already initialized volume. Never print real credentials, suggest destructive volume reset, or imply that changing environment values updates existing database roles. Settings changes require restarting the app. Feature 13 expands this README with Sandbox, AI, backup, and recovery operation. These are implementation deliverables, not documentation files created during this design session.

## Consequences

One application keeps operation and debugging manageable. Domain services can be reused by future UI and model tools without making the browser a second source of truth.

The owner must run Node and Docker, retain local secrets, and maintain compatible versions. A stopped local server means the browser cannot work. Next.js introduces rendering and server boundary concepts that require care even for a small app. Postgres adds more operational work than an embedded database, but follows the product's explicit requirement.

The scaffold proves connectivity, not financial durability, migration correctness, owner security, or backup recovery. Those require the planned later features. Do not claim that a successful probe proves them.

## Follow-up

1. Optional and outside scaffold delivery, install the selected Postgres skill in `.devin/skills/` using supported Devin conventions after source and reference review. Check the Vercel React skill source and ask before installing it. Neither investigation nor installation blocks feature 1. No skill was installed during this session.
2. Optionally connect Next.js DevTools MCP after the app runs. The owner chose later setup. Review access to development logs first. Context7 and browser tooling are already available.
3. Feature 2 captures real scaffold conventions and selects broader automated tooling. Root project guidance is currently missing. `/audit` and `/sync` own those files.
4. Feature 3 defines exact money, finance time zone, financial entities, real migrations, encryption keys, and recovery boundaries. Do not infer the finance time zone from the Mac or diagnostic clock.
5. Feature 4 chooses the design system, shadcn primitives, theme variables, and app shell. None is ratified by installing Tailwind here.
6. Feature 5 chooses a proven owner authentication approach before any protected financial surface exists. Feature 6 resolves safe local Sandbox webhook delivery without exposing the app broadly.
7. The current landscape and skill checks were partial. Separate skills or servers for Node, pnpm, TypeScript, Tailwind, Docker, and Drizzle were not individually verified. This is not evidence that none exist.

## Rationale

Reasoning, alternatives, and verified source links: [rationale.md](rationale.md).
