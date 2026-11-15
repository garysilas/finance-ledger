import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { SEED_CATEGORIES } from "./classification";
import { failure, type ServiceResult } from "./errors";
import { runMutation, uuid, type MutationAck } from "./service";
import { runUnitOfWork } from "@/server/db/finance";

const inputSchema = z
  .object({
    ownerId: uuid,
    requestId: uuid,
  })
  .strict();

export type InitializeOwnerResult = {
  ownerId: string;
  categoryIds: Record<string, string>;
};

// Create the singleton owner and seed categories. Repeatable: an existing
// owner returns with its category IDs, and seeding never resets labels or
// archive state.
export async function initializeOwner(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<InitializeOwnerResult>>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;

  // The singleton owner may already exist from an earlier setup; receipts
  // and audit must bind the real owner row, not the requested UUID.
  const resolved = await runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{ id: string }>("SELECT id FROM ledger.owner");
    return rows.rows[0]?.id ?? null;
  });
  if (!resolved.ok) {
    return resolved;
  }
  const effectiveOwnerId = resolved.value ?? input.ownerId;

  const result = await runMutation({
    databaseUrl,
    ownerId: effectiveOwnerId,
    operation: "initialize_owner",
    requestId: input.requestId,
    actorType: "setup",
    digestInput: {
      operation: "initialize_owner",
      ownerId: input.ownerId,
    },
    work: async (db) => {
      const existing = await db.query<{ id: string }>(
        "SELECT id FROM ledger.owner",
      );
      const categoryIds: Record<string, string> = {};
      const events = [];
      let inserted = 0;
      let ownerId: string;

      if (existing.rows.length > 0) {
        // Acknowledge the recorded owner rather than inventing a second.
        ownerId = existing.rows[0].id;
      } else {
        // A concurrent initializer may win the insert; DO NOTHING keeps
        // this transaction alive so the re-read below sees the winner.
        const placed = await db.query(
          `INSERT INTO ledger.owner (id, singleton_flag, time_zone)
           VALUES ($1, true, 'America/New_York')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [input.ownerId],
        );
        if (placed.rows.length > 0) {
          ownerId = input.ownerId;
          inserted += 1;
          events.push({
            targetType: "owner",
            targetId: ownerId,
            resultingRevision: 1n,
          });
        } else {
          const winner = await db.query<{ id: string }>(
            "SELECT id FROM ledger.owner",
          );
          ownerId = winner.rows[0].id;
        }
      }

      for (const seed of SEED_CATEGORIES) {
        const found = await db.query<{ id: string }>(
          `SELECT id FROM ledger.category
           WHERE owner_id = $1 AND stable_key = $2`,
          [ownerId, seed.stableKey],
        );
        if (found.rows.length > 0) {
          categoryIds[seed.stableKey] = found.rows[0].id;
          continue;
        }
        const categoryId = randomUUID();
        const placed = await db.query<{ id: string }>(
          `INSERT INTO ledger.category (id, owner_id, stable_key, label)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [categoryId, ownerId, seed.stableKey, seed.label],
        );
        if (placed.rows.length === 0) {
          const winner = await db.query<{ id: string }>(
            `SELECT id FROM ledger.category
             WHERE owner_id = $1 AND stable_key = $2`,
            [ownerId, seed.stableKey],
          );
          categoryIds[seed.stableKey] = winner.rows[0].id;
          continue;
        }
        categoryIds[seed.stableKey] = categoryId;
        inserted += 1;
        events.push({
          targetType: "category",
          targetId: categoryId,
          resultingRevision: 1n,
        });
      }

      return {
        value: { ownerId, categoryIds },
        targetId: ownerId,
        ownerId,
        resultingRevision: 1n,
        counts: { inserted, updated: 0, removed: 0 },
        events,
      };
    },
  });

  if (result.ok && result.value.alreadyApplied) {
    const categories = await runUnitOfWork(databaseUrl, async (db) => {
      const owner = await db.query<{ id: string }>(
        "SELECT id FROM ledger.owner",
      );
      const rows = await db.query<{ id: string; stable_key: string }>(
        "SELECT id, stable_key FROM ledger.category WHERE owner_id = $1",
        [owner.rows[0].id],
      );
      const categoryIds: Record<string, string> = {};
      for (const row of rows.rows) {
        categoryIds[row.stable_key] = row.id;
      }
      return { ownerId: owner.rows[0].id, categoryIds };
    });
    if (categories.ok) {
      result.value.value = categories.value;
    }
  }
  return result;
}
