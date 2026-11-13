import "server-only";

import { z } from "zod";

import {
  CLASSIFICATIONS,
  classificationMatchesAmount,
  type Classification,
} from "./classification";
import { failure, type ServiceResult } from "./errors";
import { runMutation, uuid, type MutationAck } from "./service";
import { OpFailure } from "@/server/db/finance";

// Each edit field is independently optional: omission means no change,
// explicit null resets to the provider value and blocks later pending
// inheritance, a value sets an override.
const inputSchema = z
  .object({
    ownerId: uuid,
    transactionId: uuid,
    expectedOwnerEditRevision: z.string().regex(/^\d+$/),
    categoryId: uuid.nullable().optional(),
    classification: z.enum(CLASSIFICATIONS).nullable().optional(),
    requestId: uuid,
  })
  .strict();

export type SetOverridesResult = {
  effectiveCategoryId: string | null;
  effectiveClassification: string;
  ownerEditRevision: string;
};

export async function setTransactionOverrides(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<SetOverridesResult>>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  const expectedEditRevision = BigInt(input.expectedOwnerEditRevision);

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "set_transaction_overrides",
    requestId: input.requestId,
    actorType: "owner",
    digestInput: {
      operation: "set_transaction_overrides",
      ownerId: input.ownerId,
      transactionId: input.transactionId,
      expectedOwnerEditRevision: input.expectedOwnerEditRevision,
      categoryId: input.categoryId === undefined ? "omitted" : input.categoryId,
      classification:
        input.classification === undefined ? "omitted" : input.classification,
    },
    work: async (db) => {
      const rows = await db.query<{
        id: string;
        amount_units: string;
        superseded_by_id: string | null;
        provider_category_id: string | null;
        provider_classification: string | null;
        owner_category_id: string | null;
        owner_classification: string | null;
        category_intent: string;
        classification_intent: string;
        owner_edit_revision: string;
        revision: string;
        category_inherited_from_id: string | null;
        classification_inherited_from_id: string | null;
      }>(
        `SELECT id, amount_units, superseded_by_id, provider_category_id,
                provider_classification, owner_category_id,
                owner_classification, category_intent,
                classification_intent, owner_edit_revision, revision,
                category_inherited_from_id, classification_inherited_from_id
         FROM ledger.transaction
         WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [input.transactionId, input.ownerId],
      );
      if (rows.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }
      const record = rows.rows[0];
      if (record.superseded_by_id !== null) {
        throw new OpFailure("CONFLICT", record.superseded_by_id);
      }
      if (BigInt(record.owner_edit_revision) !== expectedEditRevision) {
        throw new OpFailure("CONFLICT");
      }

      let nextOwnerCategory = record.owner_category_id;
      let nextCategoryIntent = record.category_intent;
      let categoryInheritedFrom: string | null = null;
      if (input.categoryId !== undefined) {
        if (input.categoryId === null) {
          nextOwnerCategory = null;
          nextCategoryIntent = "reset";
        } else {
          const category = await db.query<{ archived_at: Date | null }>(
            `SELECT archived_at FROM ledger.category
             WHERE id = $1 AND owner_id = $2`,
            [input.categoryId, input.ownerId],
          );
          if (category.rows.length === 0) {
            throw new OpFailure("NOT_FOUND");
          }
          if (category.rows[0].archived_at !== null) {
            throw new OpFailure("INVALID_INPUT");
          }
          nextOwnerCategory = input.categoryId;
          nextCategoryIntent = "override";
        }
      } else if (nextCategoryIntent === "inherited") {
        categoryInheritedFrom = record.category_inherited_from_id;
      }

      let nextOwnerClassification = record.owner_classification;
      let nextClassificationIntent = record.classification_intent;
      let classificationInheritedFrom: string | null = null;
      if (input.classification !== undefined) {
        if (input.classification === null) {
          nextOwnerClassification = null;
          nextClassificationIntent = "reset";
        } else {
          nextOwnerClassification = input.classification;
          nextClassificationIntent = "override";
        }
      } else if (nextClassificationIntent === "inherited") {
        classificationInheritedFrom = record.classification_inherited_from_id;
      }

      const amountUnits = BigInt(record.amount_units);
      const effectiveClassification =
        nextOwnerClassification ?? record.provider_classification;
      if (
        effectiveClassification !== null &&
        !classificationMatchesAmount(
          effectiveClassification as Classification,
          amountUnits,
        )
      ) {
        throw new OpFailure("INVALID_INPUT");
      }

      const categoryChanged =
        input.categoryId !== undefined &&
        (nextOwnerCategory !== record.owner_category_id ||
          nextCategoryIntent !== record.category_intent);
      const classificationChanged =
        input.classification !== undefined &&
        (nextOwnerClassification !== record.owner_classification ||
          nextClassificationIntent !== record.classification_intent);

      if (!categoryChanged && !classificationChanged) {
        return {
          value: {
            effectiveCategoryId:
              nextOwnerCategory ?? record.provider_category_id,
            effectiveClassification: effectiveClassification ?? "unclassified",
            ownerEditRevision: record.owner_edit_revision,
          },
          targetId: record.id,
          resultingRevision: BigInt(record.revision),
          counts: { inserted: 0, updated: 0, removed: 0 },
          events: [],
        };
      }

      const nextEditRevision = expectedEditRevision + 1n;
      const nextRevision = BigInt(record.revision) + 1n;
      await db.query(
        `UPDATE ledger.transaction
         SET owner_category_id = $4, category_intent = $5,
             category_inherited_from_id = $6,
             owner_classification = $7, classification_intent = $8,
             classification_inherited_from_id = $9,
             owner_edit_revision = $10, revision = $11, updated_at = now()
         WHERE id = $1 AND owner_id = $2 AND owner_edit_revision = $3`,
        [
          record.id,
          input.ownerId,
          expectedEditRevision.toString(),
          nextOwnerCategory,
          nextCategoryIntent,
          input.categoryId !== undefined ? null : categoryInheritedFrom,
          nextOwnerClassification,
          nextClassificationIntent,
          input.classification !== undefined
            ? null
            : classificationInheritedFrom,
          nextEditRevision.toString(),
          nextRevision.toString(),
        ],
      );

      return {
        value: {
          effectiveCategoryId: nextOwnerCategory ?? record.provider_category_id,
          effectiveClassification: effectiveClassification ?? "unclassified",
          ownerEditRevision: nextEditRevision.toString(),
        },
        targetId: record.id,
        resultingRevision: nextRevision,
        counts: { inserted: 0, updated: 1, removed: 0 },
        events: [
          {
            targetType: "transaction",
            targetId: record.id,
            resultingRevision: nextRevision,
          },
        ],
      };
    },
  });
}
