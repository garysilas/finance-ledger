import "server-only";

import { z } from "zod";

import { UNCATEGORIZED_STABLE_KEY } from "./classification";
import { failure, type ServiceResult } from "./errors";
import { runMutation, uuid, type MutationAck } from "./service";
import { OpFailure } from "@/server/db/finance";

const inputSchema = z
  .object({
    ownerId: uuid,
    categoryId: uuid,
    expectedRevision: z.string().regex(/^\d+$/),
    requestId: uuid,
  })
  .strict();

export type ArchiveCategoryResult = {
  archived: boolean;
  revision: string;
};

// Archive preserves existing links and totals; new assignments and new
// budgets reject archived categories elsewhere. Uncategorized cannot be
// archived.
export async function archiveCategory(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<ArchiveCategoryResult>>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  const expectedRevision = BigInt(input.expectedRevision);

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "archive_category",
    requestId: input.requestId,
    actorType: "owner",
    digestInput: {
      operation: "archive_category",
      ownerId: input.ownerId,
      categoryId: input.categoryId,
      expectedRevision: input.expectedRevision,
    },
    work: async (db) => {
      const rows = await db.query<{
        stable_key: string;
        archived_at: Date | null;
        revision: string;
      }>(
        `SELECT stable_key, archived_at, revision FROM ledger.category
         WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [input.categoryId, input.ownerId],
      );
      if (rows.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }
      const record = rows.rows[0];
      if (record.stable_key === UNCATEGORIZED_STABLE_KEY) {
        throw new OpFailure("INVALID_INPUT");
      }
      const revision = BigInt(record.revision);
      if (revision !== expectedRevision) {
        throw new OpFailure("CONFLICT");
      }
      if (record.archived_at !== null) {
        return {
          value: { archived: true, revision: record.revision },
          targetId: input.categoryId,
          resultingRevision: revision,
          counts: { inserted: 0, updated: 0, removed: 0 },
          events: [],
        };
      }

      const nextRevision = revision + 1n;
      await db.query(
        `UPDATE ledger.category
         SET archived_at = now(), revision = $3, updated_at = now()
         WHERE id = $1 AND owner_id = $2`,
        [input.categoryId, input.ownerId, nextRevision.toString()],
      );
      return {
        value: { archived: true, revision: nextRevision.toString() },
        targetId: input.categoryId,
        resultingRevision: nextRevision,
        counts: { inserted: 0, updated: 1, removed: 0 },
        events: [
          {
            targetType: "category",
            targetId: input.categoryId,
            resultingRevision: nextRevision,
          },
        ],
      };
    },
  });
}
