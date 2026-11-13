import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { requestDigest } from "./canonical";
import { type ServiceResult } from "./errors";
import { runUnitOfWork, OpFailure, type Db } from "@/server/db/finance";

export const uuid = z.string().uuid();
export const boundedText = (max: number) => z.string().min(1).max(max);
export const idText = boundedText(256);
export const nameText = boundedText(512);
export const descriptionText = boundedText(4096);
export const cursorText = boundedText(8192);
export const tokenText = boundedText(16384);

export type OperationCounts = {
  inserted: number;
  updated: number;
  removed: number;
};

export type CorrectionConflict = {
  recordId: string;
  field: string;
  reason: string;
  previousSourceId?: string;
};

export type MutationOutcome<T> = {
  value: T;
  targetId: string | null;
  resultingRevision: bigint | null;
  counts: OperationCounts;
  correctionConflicts?: CorrectionConflict[];
  committedCursor?: string | null;
  events: AuditEventInput[];
};

export type AuditEventInput = {
  targetType: string;
  targetId: string;
  resultingRevision: bigint;
};

export type MutationAck<T> = {
  alreadyApplied: boolean;
  targetId: string | null;
  resultingRevision: bigint | null;
  outcome: "applied" | "no_change";
  counts: OperationCounts;
  correctionConflicts: CorrectionConflict[];
  committedCursor: string | null;
  value: T;
};

type ReceiptRow = {
  request_digest: Buffer;
  target_id: string | null;
  resulting_revision: string | null;
  outcome: string;
  operation_counts: OperationCounts;
  committed_cursor: string | null;
  correction_conflicts: CorrectionConflict[] | null;
};

const EMPTY_COUNTS: OperationCounts = { inserted: 0, updated: 0, removed: 0 };

type WorkResult<T> =
  | { replayed: true; outcome: ReceiptRow; applied?: never }
  | { replayed: false; outcome?: never; applied: MutationOutcome<T> };

// Serialize mutations sharing (owner, operation, request) with a
// transaction-scoped advisory lock, then consult the durable receipt
// before any state checks. A matching digest acknowledges the original
// result; a different digest with the same request ID conflicts.
export async function runMutation<T>(args: {
  databaseUrl: string;
  ownerId: string;
  operation: string;
  requestId: string;
  actorType: "owner" | "provider" | "setup";
  digestInput: unknown;
  work: (db: Db) => Promise<MutationOutcome<T>>;
}): Promise<ServiceResult<MutationAck<T>>> {
  const digest = requestDigest(args.digestInput);
  const result = await runUnitOfWork(args.databaseUrl, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${args.ownerId}:${args.operation}:${args.requestId}`,
    ]);

    const existing = await db.query<ReceiptRow>(
      `SELECT request_digest, target_id, resulting_revision, outcome,
              operation_counts, committed_cursor, correction_conflicts
       FROM ledger.request_receipt
       WHERE owner_id = $1 AND operation = $2 AND request_id = $3`,
      [args.ownerId, args.operation, args.requestId],
    );
    const prior = existing.rows[0];
    if (prior !== undefined) {
      if (!prior.request_digest.equals(digest)) {
        throw new OpFailure("CONFLICT");
      }
      return { replayed: true as const, outcome: prior };
    }

    const applied = await args.work(db);

    const receiptId = randomUUID();
    await db.query(
      `INSERT INTO ledger.request_receipt
         (id, owner_id, operation, request_id, request_digest, target_id,
          resulting_revision, outcome, operation_counts, committed_cursor,
          correction_conflicts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        receiptId,
        args.ownerId,
        args.operation,
        args.requestId,
        digest,
        applied.targetId,
        applied.resultingRevision,
        applied.counts.inserted +
          applied.counts.updated +
          applied.counts.removed >
        0
          ? "applied"
          : "no_change",
        JSON.stringify(applied.counts),
        applied.committedCursor ?? null,
        applied.correctionConflicts?.length
          ? JSON.stringify(applied.correctionConflicts)
          : null,
      ],
    );

    for (const event of applied.events) {
      await db.query(
        `INSERT INTO ledger.audit
           (id, owner_id, receipt_id, actor_type, operation, target_type,
            target_id, resulting_revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          args.ownerId,
          receiptId,
          args.actorType,
          args.operation,
          event.targetType,
          event.targetId,
          event.resultingRevision,
        ],
      );
    }

    return { replayed: false as const, applied };
  });

  if (!result.ok) {
    return result;
  }
  const payload: WorkResult<T> = result.value;
  if (payload.replayed) {
    const row = payload.outcome;
    return {
      ok: true,
      value: {
        alreadyApplied: true,
        targetId: row.target_id,
        resultingRevision:
          row.resulting_revision === null
            ? null
            : BigInt(row.resulting_revision),
        outcome: row.outcome as "applied" | "no_change",
        counts: row.operation_counts ?? EMPTY_COUNTS,
        correctionConflicts: row.correction_conflicts ?? [],
        committedCursor: row.committed_cursor,
        value: undefined as T,
      },
    };
  }
  const applied = payload.applied;
  const changed =
    applied.counts.inserted + applied.counts.updated + applied.counts.removed >
    0;
  return {
    ok: true,
    value: {
      alreadyApplied: false,
      targetId: applied.targetId,
      resultingRevision: applied.resultingRevision,
      outcome: changed ? "applied" : "no_change",
      counts: applied.counts,
      correctionConflicts: applied.correctionConflicts ?? [],
      committedCursor: applied.committedCursor ?? null,
      value: applied.value,
    },
  };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
