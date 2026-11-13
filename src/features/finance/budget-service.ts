import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { parseMonth, monthStart } from "./dates";
import { failure, type ServiceResult } from "./errors";
import { parseMoneyToUnits } from "./money";
import { runMutation, uuid, type MutationAck } from "./service";
import { OpFailure } from "@/server/db/finance";

// expectedRevision is required for updates; "create" asserts no budget
// exists yet for the (category, month) pair.
const inputSchema = z
  .object({
    ownerId: uuid,
    categoryId: uuid,
    month: z.string().refine((value) => parseMonth(value) !== null),
    limit: z.string(),
    expectedRevision: z.union([z.literal("create"), z.string().regex(/^\d+$/)]),
    requestId: uuid,
  })
  .strict();

export type SetBudgetResult = {
  budgetId: string;
  limit: string;
  revision: string;
};

export async function setBudget(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<SetBudgetResult>>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;

  const limit = parseMoneyToUnits(input.limit, "USD");
  if (!limit.ok) {
    return failure(limit.code);
  }
  if (limit.value.units < 0n) {
    return failure("INVALID_INPUT");
  }
  const monthValue = parseMonth(input.month);
  if (!monthValue) {
    return failure("INVALID_INPUT");
  }
  const monthDate = monthStart(monthValue.year, monthValue.month);

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "set_budget",
    requestId: input.requestId,
    actorType: "owner",
    digestInput: {
      operation: "set_budget",
      ownerId: input.ownerId,
      categoryId: input.categoryId,
      month: input.month,
      limitUnits: limit.value.units,
      expectedRevision: input.expectedRevision,
    },
    work: async (db) => {
      const category = await db.query<{ archived_at: Date | null }>(
        `SELECT archived_at FROM ledger.category
         WHERE id = $1 AND owner_id = $2`,
        [input.categoryId, input.ownerId],
      );
      if (category.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }

      const existing = await db.query<{
        id: string;
        limit_units: string;
        revision: string;
      }>(
        `SELECT id, limit_units, revision FROM ledger.budget
         WHERE owner_id = $1 AND category_id = $2 AND month = $3
         FOR UPDATE`,
        [input.ownerId, input.categoryId, monthDate],
      );

      if (existing.rows.length === 0) {
        if (input.expectedRevision !== "create") {
          throw new OpFailure("CONFLICT");
        }
        if (category.rows[0].archived_at !== null) {
          throw new OpFailure("INVALID_INPUT");
        }
        const budgetId = randomUUID();
        await db.query(
          `INSERT INTO ledger.budget
             (id, owner_id, category_id, month, limit_units, currency_code)
           VALUES ($1,$2,$3,$4,$5,'USD')`,
          [
            budgetId,
            input.ownerId,
            input.categoryId,
            monthDate,
            limit.value.units.toString(),
          ],
        );
        return {
          value: {
            budgetId,
            limit: limit.value.units.toString(),
            revision: "1",
          },
          targetId: budgetId,
          resultingRevision: 1n,
          counts: { inserted: 1, updated: 0, removed: 0 },
          events: [
            { targetType: "budget", targetId: budgetId, resultingRevision: 1n },
          ],
        };
      }

      const record = existing.rows[0];
      const revision = BigInt(record.revision);
      if (
        input.expectedRevision === "create" ||
        BigInt(input.expectedRevision) !== revision
      ) {
        throw new OpFailure("CONFLICT");
      }
      if (BigInt(record.limit_units) === limit.value.units) {
        return {
          value: {
            budgetId: record.id,
            limit: record.limit_units,
            revision: record.revision,
          },
          targetId: record.id,
          resultingRevision: revision,
          counts: { inserted: 0, updated: 0, removed: 0 },
          events: [],
        };
      }

      const nextRevision = revision + 1n;
      await db.query(
        `UPDATE ledger.budget
         SET limit_units = $3, revision = $4, updated_at = now()
         WHERE id = $1 AND owner_id = $2`,
        [
          record.id,
          input.ownerId,
          limit.value.units.toString(),
          nextRevision.toString(),
        ],
      );
      return {
        value: {
          budgetId: record.id,
          limit: limit.value.units.toString(),
          revision: nextRevision.toString(),
        },
        targetId: record.id,
        resultingRevision: nextRevision,
        counts: { inserted: 0, updated: 1, removed: 0 },
        events: [
          {
            targetType: "budget",
            targetId: record.id,
            resultingRevision: nextRevision,
          },
        ],
      };
    },
  });
}
