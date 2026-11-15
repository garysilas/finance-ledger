# Finance

## Overview

Domain rules and services for Ledger's financial records. Services return typed `ServiceResult` values, never raw errors. Postgres access goes only through `src/server/db/finance.ts`; this area contains no route handlers or UI.

## Key files

1. `errors.ts` defines the fixed `FailureCode` list, `ServiceResult`, and which codes are retryable.
2. `money.ts` stores money as integer minor units with the ISO 4217 scale registry. Never float.
3. `dates.ts` owns calendar month and ledger time zone handling.
4. `canonical.ts` produces canonical serialization for request digests.
5. `service.ts` holds shared validators (zod), operation counts, and unit of work helpers.
6. `connection-service.ts`, `batch-service.ts`, `owner-service.ts`, `category-service.ts`, `budget-service.ts`, `override-service.ts`, `spending-service.ts` are the domain services per spec 0003.
7. `format.ts` and `month-param.ts` are display and URL helpers used by the app shell.

## Conventions

1. Service modules import `server-only`. Pure helpers (`money`, `dates`, `errors`, `canonical`, `format`, `month-param`) stay free of `server-only` so client components can use them.
2. Money is integer minor units plus a currency code from `money.ts`'s scale registry. A scale change for a stored currency requires an explicit migration.
3. Return `ServiceResult` with a fixed `FailureCode`; throw `OpFailure` inside a unit of work to roll back. Never leak connection objects, SQL, or raw exceptions.
4. Transfers and credit card payments do not count as spending; refunds reduce spending in the posted month; pending charges stay separate from posted totals.
5. Unit tests sit beside source as `*.test.ts`; integration coverage lives in `test/foundation.*.test.ts` against the disposable test Postgres (`pnpm db:test:up`).

## Related specs

[Spec 0003](../../../docs/specs/0003-financial-data-foundation/index.md) defines the money, ownership, migration, and token rules this area implements. [Spec 0004](../../../docs/specs/0004-design-system-app-shell/index.md) defines `format` and `month-param` display behavior.

_Drafted by /sync from the introducing change, worth a quick human pass._
