import "server-only";

import { z } from "zod";

import { failure, type FailureCode, type ServiceResult } from "./errors";
import { uuid } from "./service";
import { runUnitOfWork, OpFailure } from "@/server/db/finance";

const connectionRef = z.object({ ownerId: uuid, connectionId: uuid }).strict();

const CLAIM_STALE_MS = "10 minutes";

export type SyncClaim = {
  cursor: string | null;
  historyComplete: boolean;
};

// Atomically claim the connection for one running sync: the claim write
// only lands while no live claim exists and the connection is active. A
// claim older than ten minutes is stale and reclaimable. last_sync_attempt_at
// stamps every attempt, claimed or not is irrelevant since only a claimed
// row reaches the provider.
export async function claimSyncRun(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<SyncClaim>> {
  const parsed = connectionRef.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const claimed = await db.query<{
      sync_cursor: string | null;
      history_complete: boolean;
    }>(
      `UPDATE ledger.connection
       SET sync_started_at = now(), last_sync_attempt_at = now(),
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND state = 'active'
         AND (sync_started_at IS NULL
              OR sync_started_at < now() - interval '${CLAIM_STALE_MS}')
       RETURNING sync_cursor, history_complete`,
      [connectionId, ownerId],
    );
    if (claimed.rows.length > 0) {
      const row = claimed.rows[0];
      return { cursor: row.sync_cursor, historyComplete: row.history_complete };
    }
    const rows = await db.query<{ state: string }>(
      `SELECT state FROM ledger.connection
       WHERE id = $1 AND owner_id = $2`,
      [connectionId, ownerId],
    );
    const row = rows.rows[0];
    if (row === undefined) {
      throw new OpFailure("NOT_FOUND");
    }
    if (row.state === "needs_reconnect") {
      throw new OpFailure("NEEDS_RECONNECT");
    }
    if (row.state === "disconnected") {
      throw new OpFailure("INVALID_TRANSITION");
    }
    throw new OpFailure("SYNC_IN_PROGRESS");
  });
}

// A completed run clears the claim and the last failure, and flips
// history_complete when the drain reports it reached the end of the
// cursor chain. The flag is monotonic and never returns to false.
export async function finishSyncRun(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = connectionRef
    .extend({ historyComplete: z.boolean() })
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId, historyComplete } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET sync_started_at = NULL, last_sync_failure = NULL,
           last_successful_sync_at = now(),
           history_complete = history_complete OR $3,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [connectionId, ownerId, historyComplete],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    return null;
  });
}

// A failed run keeps its committed pages, clears the claim, and records
// the failure code. The next run resumes from the last committed cursor.
export async function failSyncRun(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = connectionRef
    .extend({
      code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Z_]+$/),
    })
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId, code } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET sync_started_at = NULL, last_sync_failure = $3,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [connectionId, ownerId, code],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    return null;
  });
}

// Return a needs_reconnect connection to active after the provider
// confirms the item error cleared. Client reported Link success alone
// never reaches this write; the adapter calls it only after /item/get.
export async function markReconnectSucceeded(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = connectionRef.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET state = 'active', last_sync_failure = NULL,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND state = 'needs_reconnect'
       RETURNING id`,
      [connectionId, ownerId],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("INVALID_TRANSITION");
    }
    return null;
  });
}

// Provider item errors move an active connection to needs_reconnect and
// release any claim so the owner can act on it.
export async function markNeedsReconnect(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = connectionRef.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET state = 'needs_reconnect', sync_started_at = NULL,
           last_sync_failure = $3,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND state = 'active'
       RETURNING id`,
      [connectionId, ownerId, "NEEDS_RECONNECT" satisfies FailureCode],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("INVALID_TRANSITION");
    }
    return null;
  });
}
