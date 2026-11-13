import "server-only";

import type { PoolClient } from "pg";

import {
  failure,
  type FailureCode,
  type ServiceResult,
} from "@/features/finance/errors";
import { getPool } from "./pool";

const STATEMENT_TIMEOUT_MS = 5000;
const OPERATION_DEADLINE_MS = 10_000;

// Domain failures thrown inside a unit of work are converted to safe
// service results; the unit of work rolls back.
export class OpFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly successorId?: string,
  ) {
    super(code);
  }
}

export type Db = PoolClient;

type UnitOfWork<T> = (db: Db) => Promise<T>;

function delay(ms: number): Promise<"expired"> {
  return new Promise((resolve) => setTimeout(() => resolve("expired"), ms));
}

function isPgError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function classifyError(error: unknown, commitIssued: boolean): FailureCode {
  if (isPgError(error)) {
    const code = error.code;
    if (commitIssued) {
      return "COMMIT_UNKNOWN";
    }
    if (code === "57014") {
      return "DB_TIMEOUT";
    }
    if (code === "23505") {
      return "CONFLICT";
    }
    if (code === "23503" || code === "23514" || code === "22023") {
      return "INVALID_INPUT";
    }
    if (code.startsWith("08") || code.startsWith("57P0") || code === "53300") {
      return "DB_UNAVAILABLE";
    }
    return "INTERNAL_FAILURE";
  }
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("ECONNRESET") ||
      message.includes("EHOSTUNREACH") ||
      message.includes("ENETUNREACH") ||
      message.includes("timeout")
    ) {
      return commitIssued ? "COMMIT_UNKNOWN" : "DB_UNAVAILABLE";
    }
  }
  return commitIssued ? "COMMIT_UNKNOWN" : "INTERNAL_FAILURE";
}

// Run a unit of work inside a transaction with the spec limits: the pool
// bounds acquisition at 2500 ms, statements get 5 s, and the whole
// operation gets a 10 s deadline. A timeout or failure rolls back; a lost
// commit response surfaces COMMIT_UNKNOWN instead of a rollback claim.
function logOutcome(outcome: string, startedAt: number): void {
  console.log(
    JSON.stringify({
      event: "ledger.finance_operation",
      outcome,
      durationMs: Math.round(performance.now() - startedAt),
    }),
  );
}

export async function runUnitOfWork<T>(
  databaseUrl: string,
  work: UnitOfWork<T>,
): Promise<ServiceResult<T>> {
  const startedAt = performance.now();
  const pool = getPool(databaseUrl);
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    logOutcome("DB_UNAVAILABLE", startedAt);
    return failure("DB_UNAVAILABLE");
  }

  let commitIssued = false;
  let finished = false;

  const execute = (async (): Promise<ServiceResult<T>> => {
    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`,
      );
      const value = await work(client);
      commitIssued = true;
      await client.query("COMMIT");
      commitIssued = false;
      finished = true;
      return { ok: true, value };
    } catch (error) {
      if (error instanceof OpFailure) {
        finished = true;
        try {
          await client.query("ROLLBACK");
        } catch {
          // rollback attempt failed; the server aborts the transaction
        }
        return failure(error.code, { successorId: error.successorId });
      }
      const code = classifyError(error, commitIssued);
      if (!commitIssued) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // connection may be dead; the server cleans up
        }
      }
      finished = true;
      return failure(code);
    }
  })();

  const raced = await Promise.race([execute, delay(OPERATION_DEADLINE_MS)]);
  if (raced === "expired") {
    client.release(new Error("operation deadline exceeded"));
    const code = commitIssued ? "COMMIT_UNKNOWN" : "DB_TIMEOUT";
    logOutcome(code, startedAt);
    return failure(code);
  }
  client.release();
  if (!finished) {
    logOutcome("INTERNAL_FAILURE", startedAt);
    return failure("INTERNAL_FAILURE");
  }
  logOutcome(raced.ok ? "OK" : raced.code, startedAt);
  return raced;
}
