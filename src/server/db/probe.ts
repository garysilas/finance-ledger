import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { logDatabaseProbe, type ProbeOutcome } from "@/server/diagnostics";

export const PROBE_BUDGET_MS = 3000;

export interface ProbeResult {
  outcome: ProbeOutcome;
  durationMs: number;
}

export interface ProbeDeps {
  connect: () => Promise<PoolClient>;
  runCheck: (client: PoolClient) => Promise<unknown>;
  now: () => number;
}

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "57P01",
  "57P02",
  "57P03",
]);

const AUTH_ERROR_CODES = new Set(["28P01", "28000"]);

function classifyError(error: unknown): ProbeOutcome {
  const err = error as { code?: string; errno?: string } | null;
  const code = err?.code ?? err?.errno;
  if (code && AUTH_ERROR_CODES.has(code)) return "DB_AUTH_FAILED";
  if (code && CONNECTION_ERROR_CODES.has(code)) return "DB_CONNECTION_FAILED";
  if (code && code.startsWith("08")) return "DB_CONNECTION_FAILED";
  return "DB_QUERY_FAILED";
}

function delay(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(resolve, ms, "timeout"));
}

async function runQueryCheck(client: PoolClient): Promise<unknown> {
  const db = drizzle(client);
  const result = await db.execute(sql`SELECT 1`);
  const rows = (result as { rows?: unknown[] }).rows;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("unexpected result");
  }
  return rows;
}

const defaultDeps: ProbeDeps = {
  connect: () => {
    throw new Error("connect must be provided");
  },
  runCheck: runQueryCheck,
  now: () => performance.now(),
};

export async function probeDatabase(deps: ProbeDeps): Promise<ProbeResult> {
  const now = deps.now ?? defaultDeps.now;
  const started = now();
  const deadline = started + PROBE_BUDGET_MS;

  const acquire = deps.connect().then(
    (c) => ({ client: c as PoolClient, error: null as unknown }),
    (error: unknown) => ({ client: null as unknown as PoolClient, error }),
  );
  const acquired = await Promise.race([
    acquire,
    delay(Math.max(0, deadline - now())),
  ]);
  if (acquired === "timeout") {
    acquire
      .then(({ client: late }) => late?.release())
      .catch(() => {});
    return finish("DB_ACQUIRE_TIMEOUT", now, started);
  }
  if (acquired.error !== null) {
    const error = acquired.error as { message?: string };
    if (typeof error?.message === "string" && /timeout/i.test(error.message)) {
      return finish("DB_ACQUIRE_TIMEOUT", now, started);
    }
    return finish(classifyError(acquired.error), now, started);
  }
  const client = acquired.client;

  const remaining = deadline - now();
  if (remaining <= 0) {
    client.release();
    return finish("DB_QUERY_TIMEOUT", now, started);
  }

  const runCheck = deps.runCheck ?? runQueryCheck;
  const outcome = await Promise.race([
    runCheck(client)
      .then(() => "DB_OK" as const)
      .catch((error: unknown) => classifyError(error)),
    delay(remaining),
  ]);

  if (outcome === "timeout") {
    client.release(new Error("probe deadline exceeded"));
    return finish("DB_QUERY_TIMEOUT", now, started);
  }
  client.release();
  return finish(outcome, now, started);
}

function finish(outcome: ProbeOutcome, now: () => number, started: number): ProbeResult {
  const durationMs = Math.round(now() - started);
  logDatabaseProbe(outcome, durationMs);
  return { outcome, durationMs };
}

export async function probeWithConfig(
  databaseUrl: string,
  overrides: Partial<ProbeDeps> = {},
): Promise<ProbeResult> {
  const { getPool } = await import("@/server/db/pool");
  const pool: Pool = getPool(databaseUrl);
  return probeDatabase({ ...defaultDeps, connect: () => pool.connect(), ...overrides });
}
