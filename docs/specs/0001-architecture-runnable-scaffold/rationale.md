# Architecture reasoning

## Context

Ledger is a lasting learning project for one owner, accessed through a browser on this Mac. Postgres in Docker and local browser access are already product constraints. The first useful release is spending and budgets. AI and richer analysis must not delay that loop.

The workspace contains only `docs/scope/scope.md`. There is no source code, existing spec, root project guidance, workspace configuration, or Git repository. Scope feature 1 asks for an architecture decision and the smallest runnable scaffold. Its approach is Tracer Bullet, with Beta verification and testing.

Premise note: Local operation is not the same as a browser that works with its server stopped. The owner explicitly chose the local server as the durable data authority. This avoids introducing a second database and a reconciliation protocol before the spending loop exists.

This record covers the foundation, not the whole product architecture in advance. Financial schema, owner authentication, visual design, model behavior, and sync reliability have separate scope features. Nothing here certifies compliance with a regulatory standard.

## Options considered

### Option 1: One Next.js application with local Postgres

Use one typed application, with server rendering and feature services. Its strength is a small operational footprint and reuse of the owner's proposed stack. Its cost is learning Next.js rendering and server boundaries while operating Node and Docker locally (basis: scope feature 1, Next.js self hosting documentation).

### Option 2: React browser application and separate API server

Use a dedicated browser app with explicit HTTP contracts to a server that owns Postgres. This makes the network boundary clear and supports multiple clients well. It also adds a second application setup and more transport code for one local owner (basis: separation of concerns, scope local deployment constraint).

### Option 3: Desktop application with a local backend

A desktop package could manage application startup and integrate with operating system secret storage. It adds packaging, updates, and platform integration before the product needs them, and changes the browser focused delivery plan (basis: scope platform and incremental delivery boundaries).

## Rationale

Choose option 1 because the owner wants to learn and operate one local finance application, not maintain separate deployment units. Next.js supports a local Node server and server private configuration. Direct service calls let server rendered pages read Postgres without an internal network hop. The runner up is a separate API, which becomes useful if a second client or a measured deployment constraint appears (basis: scope feature 1, Next.js self hosting documentation).

Use Drizzle with `pg` because it preserves typed application access and visible SQL. Generate, review, and explicitly apply migrations instead of coupling schema changes to application startup. Prisma is the runner up for a more generated client workflow. Plain `pg` is viable but leaves more manual type and migration work (basis: Drizzle PostgreSQL migration documentation).

Use Node 24 LTS rather than immediately adopting the newly listed Node 26 LTS line. The official download page showed both as supported LTS choices during this session. The selected older line favors maturity. Exact patched versions still require checking at build setup, not copying a documentation result blindly (basis: Node.js official download page).

The database status page is the smallest useful thread through browser, server, driver, and Postgres. A saved setup record would prove a write but invent a table before data design. An app page without a database check would prove less than the recorded build approach requires (basis: scope Tracer Bullet approach).

A small shared connection pool limits accidental connection growth during development. An uncached, bounded probe provides honest status. Polling or a cached success could hide a stopped database and adds behavior the owner does not need (basis: bounded resource use, truthful diagnostics).

Loopback binding, canonical Host validation, and Origin validation reduce accidental network exposure and foreign browser request risk. They do not establish owner identity. Authentication must remain a separate deliberate decision before private data appears (basis: scope security boundaries, defense in depth).

Use local safe console events rather than a hosted error service because diagnostics must not create a new outbound data path. Use an ignored environment file with runtime validation rather than a keychain integration because it is easy to inspect and run across the host application and Compose. The owner accepts protecting that local file. Key recovery and financial backup procedures need their own later proof (basis: scope local diagnostics and recovery boundaries).

Tailwind now establishes only the chosen CSS foundation. shadcn and tweakcn remain unratified until visual system design. No future provider package is installed simply because the scope mentions it (basis: scope features 1 and 4).

## Independent review and accepted resolutions

An independent model reviewed the draft using only the spec and scope. The owner accepted the recommended resolutions. Next.js and Tailwind major selection now requires explicit owner approval during setup. Database URL validation is exact, and a restricted application login is separate from the privileged bootstrap login. Compose and application credentials are checked for consistency without logging secrets.

The status contract now names literal copy, outcomes, safe diagnostic fields, HTTP behavior, cache policy, and timeout fault injection. Setup troubleshooting does not claim the app can diagnose Docker or port conflicts from a failed database connection. Feature 1 owns a minimal operating README and minimum test framework selection. The scope explicitly distinguishes architecture decisions from buildable feature plans.

Retain Drizzle to verify the selected future access path, but defer Drizzle Kit until actual schema work. Optional skill installation and investigation are outside feature 1's delivery requirements. These changes close the reviewed gaps without adding financial schema or changing the product's deployment boundary (basis: independent review supplied by the owner, scope Beta workflow, least privilege).

The owner chose Vitest for pure logic and timeout fault injection, and Playwright with Chromium for the browser path. Node's built in runner is the smaller dependency alternative but requires more explicit TypeScript and mocking setup. Cypress is a credible browser alternative but offers no particular advantage for this small production page. Isolated database test resources prevent outage checks from stopping the owner's database or modifying its volume (basis: Vitest timer documentation, Playwright web server documentation, test isolation).

## Discovery evidence

The owner chose references with verified links, selected the Postgres skill for later build setup, requested investigation of the Vercel React skill source, and deferred Next.js DevTools MCP setup.

The skill registry reported about 880,000 installs and 33,700 repository stars for Vercel React Best Practices. Its linked GitHub repository fetch returned 404, while a subsequent search returned that same official repository and its `skills/react-best-practices` source path. This mismatch remains unresolved. Search visibility is not successful source verification, so no installation is recorded or implied.

The registry reported about 478,000 installs and 3,000 repository stars for Supabase Postgres Best Practices. Its repository and raw skill entry were available. The entry states that its guidance applies to Postgres anywhere. Adopting it does not adopt the Supabase platform. The full supporting reference set has not been installed or reviewed here.

Official Next.js documentation confirms that Next.js DevTools MCP can access development errors, routes, and logs. Setup is optional and deferred. Documentation and browser MCP tools are already connected. No new configuration or community skill was written during this design session.

Discovery covered the stack in grouped searches, not exhaustive per tool registry scans. No verified separate recommendation is made for Node, pnpm, TypeScript, Tailwind, Docker, or Drizzle. The optional discovery limitation does not alter the application stack decisions.

## References

### Project sources

[Ledger scope](../../scope/scope.md), especially feature 1, shared security boundaries, feature 4, and the Tracer Bullet approach.

### Practices and standards

Separation of concerns. Incremental delivery. Bounded resource use. Truthful diagnostics. Defense in depth.

### Verified documentation results

1. [Next.js self hosting documentation](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/self-hosting.mdx), returned by Context7 during the architecture discussion. It describes local server operation and server environment variables. The linked branch is mutable, so build setup must use documentation matching the installed release.
2. [Drizzle PostgreSQL migrations](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/pg/migrations.mdx), returned by Context7 during the architecture discussion. It describes generated SQL and explicit migration application.
3. [Node.js download page](https://nodejs.org/en/download/), fetched during the landscape check. It listed Node 26 and Node 24 as LTS lines.
4. [Next.js MCP guide](https://nextjs.org/docs/app/guides/mcp), fetched during discovery. It explains access to development diagnostics.
5. [Vercel React skill registry entry](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices), fetched during discovery. The repository mismatch is recorded above.
6. [Supabase Postgres skill registry entry](https://skills.sh/supabase/agent-skills/supabase-postgres-best-practices), fetched during discovery.
7. [Supabase skill entry](https://raw.githubusercontent.com/supabase/agent-skills/main/skills/supabase-postgres-best-practices/SKILL.md), fetched during discovery.
8. [Vitest timer testing](https://github.com/vitest-dev/vitest/blob/main/docs/guide/mocking/timers.md), returned by Context7 when resolving the review's test framework decision.
9. [Playwright web server configuration](https://github.com/microsoft/playwright/blob/main/docs/src/test-webserver-js.md), returned by Context7 when resolving the review's test framework decision.

These links record the checks already performed for human follow up. Later spec review and build steps should not fetch them again merely to repeat this research. Tool usage during implementation should use installed version documentation where necessary.
