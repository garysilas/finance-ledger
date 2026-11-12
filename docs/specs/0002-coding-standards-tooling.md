# 0002. Coding standards and tooling

**Date**: 2026-11-08
**Status**: Accepted

## Summary

Use Prettier to format project files and keep ESLint for code checks. One local command checks formatting, lint, strict types, and unit tests. Format existing supported files once so later work starts from a consistent baseline. Production builds and browser tests remain separate.

## Context

Feature 2 follows the completed runnable scaffold. The app already has ESLint with Next.js and TypeScript rules, strict TypeScript, Vitest, and Playwright. Root and server guidance was captured by the preceding audit and remains uncommitted.

Formatting currently depends on manual edits. For example, `src/app/page.tsx` wraps a short assignment across lines but keeps a long section opening tag on one line. Other files already resemble conventional automatic formatting. These are layout differences, not defects in application behavior. There is no evidence that a new lint rule set is needed.

This is one Next.js app operated locally. The Beta workflow requires separate verification and tests before the feature closes. The project uses Tracer Bullet delivery, which means proving a thin working command path before applying it across the repository.

## Options considered

### Option 1: Automatic checks and one formatting pass

Add Prettier beside existing tools and format existing supported files once. This gives immediate consistency and a clear local result. It creates a larger initial diff and adds one development dependency.

### Option 2: Enforce only on later edits

Add tooling but format only files touched by later tasks. This reduces the initial diff, but leaves mixed formatting and makes a repository wide formatting check unsuitable until the backlog is cleared.

### Option 3: Written conventions only

Keep checks as they are and rely on review for formatting. This adds no dependency or formatting diff, but leaves consistency dependent on human attention.

## Decision

**Chosen option**: Option 1, automatic checks and one formatting pass.

Use Prettier alongside the existing ESLint configuration. Keep current Next.js and TypeScript rules and make warnings fail lint. Run checks only through explicit local commands. Add no hosted automation, Git hooks, Tailwind sorting plugin, Agent Skill, or MCP server.

## Rationale

The scaffold already provides the tools needed for code correctness checks. Adding one formatter fills the missing capability without replacing working lint or test infrastructure. Prettier is preferred over Biome here because ESLint remains the chosen code checker, so replacing that tool adds no needed capability.

Separate write and check commands make changes intentional. Stopping at the first failure keeps command composition simple. Keeping browser tests and builds separate avoids requiring a free browser server port for routine checks.

## Standard definition

### Canonical pattern

The package scripts expose this command contract:

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check
pnpm build
pnpm test:e2e
```

`format` invokes the local Prettier binary with `--write .`. `format:check` invokes it with `--check .`. Both pass `--config .devin/prettier.json` and `--ignore-path .devin/prettier.ignore` and run from the repository root through package scripts.

`lint` invokes the existing ESLint binary with `--max-warnings 0`. Keep the existing rule sets and ignores. Do not add rules, disable checks, or use automatic lint fixes in the check command.

`check` runs `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` in that order. A failed command stops the sequence and returns failure. It never invokes a formatting or lint write mode. Existing tool caches and TypeScript build metadata are allowed, but checks must not rewrite maintained source or configuration.

`build` and `test:e2e` retain their existing behavior and stay outside `check`. No command added here starts or stops the database.

### Formatting settings

Create `.devin/prettier.json` with `tabWidth: 2`, `useTabs: false`, `singleQuote: false`, and `semi: true`. Use the installed Prettier release defaults for all remaining settings. Do not add a plugin or sort imports or Tailwind classes.

Install an exact stable Prettier version compatible with Node 24, published at least seven days before installation. Resolve the version from package release metadata during build setup. Record that exact version in `package.json` and the pnpm lockfile. Do not change unrelated package versions or security controls.

### Coverage and exclusions

Format supported source, tests, configuration, CSS, JSON, YAML, and Markdown throughout the repository, including project guidance and specs. Unsupported file types do not need a parser or plugin.

The explicit ignore file lives at `.devin/prettier.ignore`. Exclude dependencies, Git metadata, generated files, build output, test reports, caches, lockfiles, and private environment files. At minimum cover `node_modules/`, `.git/`, `.next/`, `out/`, `build/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `.vercel/`, `next-env.d.ts`, `*.tsbuildinfo`, `pnpm-lock.yaml`, other package manager lockfiles if present, and `.env*`. Environment templates do not need formatting. Preserve any additional existing ignored generated or private paths when deriving the final exclusions from `.gitignore`.

Do not create a root formatter configuration. New formatter settings belong in `.devin/`. Existing root configuration files remain in place. The explicit command arguments prevent the nested formatter settings from being missed.

### Replaces

1. Manual formatting as the sole consistency mechanism.
2. Lint warnings being treated as a passing routine result.
3. Running an informal selection of checks instead of the named routine command.

### Enforcement and failure handling

The local formatter, ESLint, TypeScript, and Vitest command exit results enforce the standard when invoked. No remote service enforces it. The owner must run checks explicitly.

Formatting differences produce a failed formatting check. Run `pnpm format`, review the diff, then rerun `pnpm check`. Syntax errors or invalid configuration must fail visibly rather than being ignored. Lint warnings must fail without weakening the existing rules. Existing check failures must be reported and fixed within scope, or raised as blockers. Do not hide them with broader ignores.

Before the initial formatting pass, confirm that existing uncommitted files can be included. Do not overwrite unrelated work. Formatting may change layout only, not comments, prose meaning, application values, database behavior, or security boundaries. Preserve the Next.js generated guidance block.

### Rollout

First prove formatter configuration and the full routine command on representative source and configuration. Then apply the same formatter to all included project files and confirm that a second write pass makes no further changes. Update operating instructions in the existing README to explain the commands, their order, configuration paths, and separate browser test requirements. Do not create a new documentation file for command instructions.

### Value sourcing

1. Formatted content comes from each included file, the explicit formatter configuration, and the exact installed Prettier release defaults.
2. File coverage comes from repository contents, supported Prettier parsers, and the explicit ignore file derived from the exclusions above.
3. Lint results come from the existing ESLint configuration with a warning limit of zero.
4. Type results come from the existing strict `tsconfig.json` and TypeScript command.
5. Unit test results come from the existing Vitest configuration and test files.
6. The routine result comes from the ordered child command exit results. Zero means every command passed. Any failure stops the sequence.

### Verification scenarios

1. All included files pass formatting after the initial pass. A second formatting pass produces no further diff.
2. A temporary formatting error in an included file makes both the formatting check and routine command fail. The file remains unchanged by the check. Restore only the temporary edit.
3. A controlled failing child command proves that later commands do not run and the routine result fails. Use an isolated harness, not permanent failing tests or edits to production settings.
4. Confirm the lint script uses `--max-warnings 0` and that a controlled warning fails lint. Do not retain a warning fixture in application code.
5. Excluded files are not formatted or checked by Prettier. Verify coverage with safe fixtures, never by inspecting secrets.
6. `pnpm check` passes without a live database, without private database credentials, and without starting a browser server.
7. Run the existing production build and browser tests separately for final regression coverage. Browser tests retain the existing free port and isolated database rules from spec 0001.

### Exceptions and boundaries

Excluded and unsupported files are the only formatting exceptions. No new database records, migrations, endpoints, screens, authentication, environment variables, credentials, or financial rules are introduced. Keep the current strict type settings, test conventions, network bindings, and secret protections.

## Consequences

The project gains one repeatable routine command and consistent formatting. The initial formatting diff will touch files unrelated to application behavior and needs careful review. Local checks can still be skipped because there is no Git hook or hosted enforcement. Default formatter behavior can change when the dependency is upgraded, so future upgrades require a reviewed formatting diff.

This decision remains Proposed until implementation starts. Feature 2 cannot close at Beta until separate verification and tests are complete.

## Follow-up

1. After implementation, sync the command and formatting conventions into the existing project guidance. Do not restructure that guidance during this design task.
2. Record that optional Prettier skills and MCP integration were declined. The searched skill included Git hook setup outside this standard. No integration was installed.
3. Keep the README version wording mismatch and runtime bootstrap password mismatch outside this formatting change. They remain separate concerns from the audit.
