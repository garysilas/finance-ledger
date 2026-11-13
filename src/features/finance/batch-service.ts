import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  CLASSIFICATIONS,
  fallbackClassification,
  UNCATEGORIZED_STABLE_KEY,
  classificationMatchesAmount,
  type Classification,
} from "./classification";
import { parseCalendarDate } from "./dates";
import { failure, type ServiceResult } from "./errors";
import { parseMoneyToUnits } from "./money";
import {
  cursorText,
  descriptionText,
  idText,
  nameText,
  runMutation,
  uuid,
  type CorrectionConflict,
  type MutationAck,
} from "./service";
import { OpFailure, type Db } from "@/server/db/finance";

const calendarDate = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null);

const accountObservation = z
  .object({
    providerAccountId: idText,
    name: nameText,
    officialName: nameText.nullable().default(null),
    type: idText,
    subtype: idText.nullable().default(null),
    currencyCode: idText.nullable().default(null),
    current: z.string().nullable().default(null),
    available: z.string().nullable().default(null),
    creditLimit: z.string().nullable().default(null),
    balanceObservedAt: z
      .string()
      .datetime({ offset: false })
      .nullable()
      .default(null),
  })
  .strict();

const transactionUpsert = z
  .object({
    providerTransactionId: idText,
    providerAccountId: idText,
    amount: z.string(),
    currencyCode: idText,
    postingState: z.enum(["pending", "posted"]),
    providerDate: calendarDate,
    postedDate: calendarDate.nullable().default(null),
    authorizedDate: calendarDate.nullable().default(null),
    providerPendingTransactionId: idText.nullable().default(null),
    description: descriptionText,
    merchantName: nameText.nullable().default(null),
    providerCategoryCode: idText.nullable().default(null),
    providerCategoryStableKey: idText.nullable().default(null),
    providerClassification: z.enum(CLASSIFICATIONS).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.postingState === "posted" && value.postedDate === null) {
      ctx.addIssue({ code: "custom", message: "posted requires postedDate" });
    }
    if (value.postingState === "pending" && value.postedDate !== null) {
      ctx.addIssue({ code: "custom", message: "pending forbids postedDate" });
    }
  });

const batchInput = z
  .object({
    ownerId: uuid,
    connectionId: uuid,
    expectedCursor: cursorText.nullable(),
    nextCursor: cursorText,
    accountObservations: z.array(accountObservation),
    transactionUpserts: z.array(transactionUpsert),
    removalIds: z.array(idText),
    requestId: uuid,
  })
  .strict()
  .superRefine((value, ctx) => {
    const totalOps =
      value.accountObservations.length +
      value.transactionUpserts.length +
      value.removalIds.length;
    if (totalOps > 1000) {
      ctx.addIssue({
        code: "custom",
        message: "batch exceeds 1000 operations",
      });
    }
    const accountIds = new Set<string>();
    for (const account of value.accountObservations) {
      if (accountIds.has(account.providerAccountId)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate account observation",
        });
      }
      accountIds.add(account.providerAccountId);
    }
    const upsertIds = new Set<string>();
    for (const upsert of value.transactionUpserts) {
      if (upsertIds.has(upsert.providerTransactionId)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate transaction upsert",
        });
      }
      upsertIds.add(upsert.providerTransactionId);
    }
    const removalIds = new Set<string>();
    for (const id of value.removalIds) {
      if (removalIds.has(id)) {
        ctx.addIssue({ code: "custom", message: "duplicate removal" });
      }
      if (upsertIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "identity present in upserts and removals",
        });
      }
      removalIds.add(id);
    }
  });

const MAX_BATCH_BYTES = 2 * 1024 * 1024;

export type ApplyProviderBatchResult = {
  connectionId: string;
  cursor: string;
};

type ExistingTransaction = {
  id: string;
  account_id: string;
  provider_transaction_id: string;
  amount_units: string;
  posting_state: string;
  provider_pending_transaction_id: string | null;
  superseded_by_id: string | null;
  removed_at: Date | null;
  owner_classification: string | null;
  classification_intent: string;
  classification_inherited_from_id: string | null;
  owner_category_id: string | null;
  category_intent: string;
  category_inherited_from_id: string | null;
  owner_edit_revision: string;
};

// Apply one provider batch atomically: account observations, transaction
// upserts, explicit pending replacement links, removals, and the cursor
// advance commit or roll back together.
export async function applyProviderBatch(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<ApplyProviderBatchResult>>> {
  if (
    Buffer.byteLength(JSON.stringify(rawInput ?? null), "utf8") >
    MAX_BATCH_BYTES
  ) {
    return failure("INVALID_INPUT");
  }
  const parsed = batchInput.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;

  const sortedAccounts = [...input.accountObservations].sort((a, b) =>
    a.providerAccountId.localeCompare(b.providerAccountId),
  );
  const sortedUpserts = [...input.transactionUpserts].sort((a, b) =>
    a.providerTransactionId.localeCompare(b.providerTransactionId),
  );
  const sortedRemovals = [...input.removalIds].sort();

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "apply_provider_batch",
    requestId: input.requestId,
    actorType: "provider",
    digestInput: {
      operation: "apply_provider_batch",
      ownerId: input.ownerId,
      connectionId: input.connectionId,
      expectedCursor: input.expectedCursor,
      nextCursor: input.nextCursor,
      accountObservations: sortedAccounts,
      transactionUpserts: sortedUpserts,
      removalIds: sortedRemovals,
    },
    work: async (db) => {
      const connection = await db.query<{
        state: string;
        sync_cursor: string | null;
        revision: string;
      }>(
        `SELECT state, sync_cursor, revision FROM ledger.connection
         WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [input.connectionId, input.ownerId],
      );
      if (connection.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }
      const conn = connection.rows[0];
      if (conn.state !== "active") {
        throw new OpFailure("INVALID_TRANSITION");
      }
      const cursorMatches =
        conn.sync_cursor === input.expectedCursor ||
        (conn.sync_cursor === null && input.expectedCursor === null);
      if (!cursorMatches) {
        throw new OpFailure("CONFLICT");
      }

      const counts = { inserted: 0, updated: 0, removed: 0 };
      const conflicts: CorrectionConflict[] = [];
      const events = [];

      const categoryIds = await loadCategoryMap(db, input.ownerId);

      for (const account of sortedAccounts) {
        counts[await upsertAccount(db, input, account)] += 1;
      }

      const touchedPosted = new Set<string>();
      const touchedPending = new Set<string>();

      for (const upsert of sortedUpserts) {
        const outcome = await upsertTransaction(
          db,
          input,
          upsert,
          categoryIds,
          conflicts,
        );
        counts[outcome.kind] += 1;
        if (upsert.postingState === "posted") {
          touchedPosted.add(upsert.providerTransactionId);
        } else {
          touchedPending.add(upsert.providerTransactionId);
        }
      }

      for (const removalId of sortedRemovals) {
        const result = await db.query<{ id: string }>(
          `UPDATE ledger.transaction
           SET removed_at = now(), revision = revision + 1, updated_at = now()
           WHERE connection_id = $1 AND provider_transaction_id = $2
             AND removed_at IS NULL
           RETURNING id`,
          [input.connectionId, removalId],
        );
        counts.removed += result.rows.length;
      }

      // Pending replacement links reconcile in both arrival orders: the
      // link is recorded on the posted record and fills the pending
      // record's supersession target once.
      await reconcileLinks(db, input, touchedPosted, touchedPending, conflicts);

      const nextRevision = BigInt(conn.revision) + 1n;
      await db.query(
        `UPDATE ledger.connection
         SET sync_cursor = $3, last_successful_sync_at = now(),
             revision = $4, updated_at = now()
         WHERE id = $1 AND owner_id = $2`,
        [
          input.connectionId,
          input.ownerId,
          input.nextCursor,
          nextRevision.toString(),
        ],
      );

      events.push({
        targetType: "connection",
        targetId: input.connectionId,
        resultingRevision: nextRevision,
      });

      return {
        value: { connectionId: input.connectionId, cursor: input.nextCursor },
        targetId: input.connectionId,
        resultingRevision: nextRevision,
        counts,
        correctionConflicts: conflicts,
        committedCursor: input.nextCursor,
        events,
      };
    },
  });
}

async function loadCategoryMap(
  db: Db,
  ownerId: string,
): Promise<Map<string, { id: string; archived: boolean }>> {
  const rows = await db.query<{
    id: string;
    stable_key: string;
    archived_at: Date | null;
  }>(
    "SELECT id, stable_key, archived_at FROM ledger.category WHERE owner_id = $1",
    [ownerId],
  );
  const map = new Map<string, { id: string; archived: boolean }>();
  for (const row of rows.rows) {
    map.set(row.stable_key, { id: row.id, archived: row.archived_at !== null });
  }
  return map;
}

function resolveProviderCategory(
  stableKey: string | null,
  categories: Map<string, { id: string; archived: boolean }>,
): string | null {
  if (stableKey === null) {
    return null;
  }
  const found = categories.get(stableKey);
  if (!found || found.archived) {
    // Archived or unknown provider categories map to Uncategorized.
    return categories.get(UNCATEGORIZED_STABLE_KEY)?.id ?? null;
  }
  return found.id;
}

async function upsertAccount(
  db: Db,
  input: { ownerId: string; connectionId: string },
  account: z.infer<typeof accountObservation>,
): Promise<"inserted" | "updated"> {
  let currencyScale: number | null = null;
  const units: {
    current: bigint | null;
    available: bigint | null;
    credit: bigint | null;
  } = {
    current: null,
    available: null,
    credit: null,
  };

  const hasAmounts =
    account.current !== null ||
    account.available !== null ||
    account.creditLimit !== null;
  if (account.currencyCode !== null || hasAmounts) {
    if (account.currencyCode === null) {
      throw new OpFailure("INVALID_INPUT");
    }
    const parsed = parseMoneyToUnits("0", account.currencyCode);
    if (!parsed.ok) {
      throw new OpFailure(parsed.code);
    }
    currencyScale = parsed.value.scale;
    const pairs = [
      [account.current, "current"],
      [account.available, "available"],
      [account.creditLimit, "credit"],
    ] as const;
    for (const [value, key] of pairs) {
      if (value !== null) {
        const amount = parseMoneyToUnits(value, account.currencyCode);
        if (!amount.ok) {
          throw new OpFailure(amount.code);
        }
        units[key] = amount.value.units;
      }
    }
  }
  const currentUnits = units.current;
  const availableUnits = units.available;
  const creditLimitUnits = units.credit;

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM ledger.account
     WHERE connection_id = $1 AND provider_account_id = $2`,
    [input.connectionId, account.providerAccountId],
  );

  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO ledger.account
         (id, owner_id, connection_id, provider_account_id, name,
          official_name, type, subtype, currency_code, currency_scale,
          current_units, available_units, credit_limit_units,
          balance_observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        randomUUID(),
        input.ownerId,
        input.connectionId,
        account.providerAccountId,
        account.name,
        account.officialName,
        account.type,
        account.subtype,
        account.currencyCode,
        currencyScale,
        currentUnits?.toString() ?? null,
        availableUnits?.toString() ?? null,
        creditLimitUnits?.toString() ?? null,
        account.balanceObservedAt,
      ],
    );
    return "inserted";
  }

  await db.query(
    `UPDATE ledger.account
     SET name = $3, official_name = $4, type = $5, subtype = $6,
         currency_code = $7, currency_scale = $8, current_units = $9,
         available_units = $10, credit_limit_units = $11,
         balance_observed_at = $12,
         revision = revision + 1, updated_at = now()
     WHERE id = $1 AND owner_id = $2`,
    [
      existing.rows[0].id,
      input.ownerId,
      account.name,
      account.officialName,
      account.type,
      account.subtype,
      account.currencyCode,
      currencyScale,
      currentUnits?.toString() ?? null,
      availableUnits?.toString() ?? null,
      creditLimitUnits?.toString() ?? null,
      account.balanceObservedAt,
    ],
  );
  return "updated";
}

async function upsertTransaction(
  db: Db,
  input: { ownerId: string; connectionId: string },
  upsert: z.infer<typeof transactionUpsert>,
  categories: Map<string, { id: string; archived: boolean }>,
  conflicts: CorrectionConflict[],
): Promise<{ kind: "inserted" | "updated"; changedOwnerField: boolean }> {
  const account = await db.query<{ id: string }>(
    `SELECT id FROM ledger.account
     WHERE connection_id = $1 AND provider_account_id = $2`,
    [input.connectionId, upsert.providerAccountId],
  );
  if (account.rows.length === 0) {
    throw new OpFailure("INVALID_INPUT");
  }
  const accountId = account.rows[0].id;

  const amount = parseMoneyToUnits(upsert.amount, upsert.currencyCode);
  if (!amount.ok) {
    throw new OpFailure(amount.code);
  }
  const units = amount.value.units;
  const scale = amount.value.scale;

  const classification =
    upsert.providerClassification ?? fallbackClassification(units);
  if (!classificationMatchesAmount(classification, units)) {
    throw new OpFailure("INVALID_INPUT");
  }
  const providerCategoryId = resolveProviderCategory(
    upsert.providerCategoryStableKey,
    categories,
  );

  const existingRows = await db.query<ExistingTransaction>(
    `SELECT id, account_id, provider_transaction_id, amount_units,
            posting_state, provider_pending_transaction_id,
            superseded_by_id, removed_at, owner_classification,
            classification_intent, classification_inherited_from_id,
            owner_category_id, category_intent,
            category_inherited_from_id, owner_edit_revision
     FROM ledger.transaction
     WHERE connection_id = $1 AND provider_transaction_id = $2
     FOR UPDATE`,
    [input.connectionId, upsert.providerTransactionId],
  );

  if (existingRows.rows.length === 0) {
    await db.query(
      `INSERT INTO ledger.transaction
         (id, owner_id, connection_id, account_id, provider_transaction_id,
          amount_units, currency_code, currency_scale, posting_state,
          provider_date, posted_date, authorized_date,
          provider_pending_transaction_id, description, merchant_name,
          provider_category_code, provider_category_id,
          provider_classification)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        randomUUID(),
        input.ownerId,
        input.connectionId,
        accountId,
        upsert.providerTransactionId,
        units.toString(),
        upsert.currencyCode,
        scale,
        upsert.postingState,
        upsert.providerDate,
        upsert.postedDate,
        upsert.authorizedDate,
        upsert.providerPendingTransactionId,
        upsert.description,
        upsert.merchantName,
        upsert.providerCategoryCode,
        providerCategoryId,
        classification,
      ],
    );
    return { kind: "inserted", changedOwnerField: false };
  }

  const existing = existingRows.rows[0];
  if (existing.account_id !== accountId) {
    throw new OpFailure("INVALID_INPUT");
  }
  // Established link fields are immutable once set.
  if (
    existing.superseded_by_id !== null &&
    upsert.postingState !== existing.posting_state
  ) {
    throw new OpFailure("INVALID_INPUT");
  }
  if (
    existing.provider_pending_transaction_id !== null &&
    existing.provider_pending_transaction_id !==
      upsert.providerPendingTransactionId
  ) {
    throw new OpFailure("INVALID_INPUT");
  }

  let ownerClassification = existing.owner_classification;
  let classificationIntent = existing.classification_intent;
  let classificationInheritedFrom = existing.classification_inherited_from_id;
  let ownerEditRevision = BigInt(existing.owner_edit_revision);
  let changedOwnerField = false;

  if (classificationIntent === "inherited") {
    if (!classificationMatchesAmount(classification as Classification, units)) {
      // A provider amount change invalidated the inherited classification:
      // clear only that inherited field, report the conflict, restore
      // untouched intent.
      conflicts.push({
        recordId: existing.id,
        field: "classification",
        reason: "inherited_classification_sign_conflict",
        previousSourceId: classificationInheritedFrom ?? undefined,
      });
      ownerClassification = null;
      classificationIntent = "untouched";
      classificationInheritedFrom = null;
      ownerEditRevision += 1n;
      changedOwnerField = true;
    }
  } else if (
    classificationIntent === "override" &&
    ownerClassification !== null &&
    !classificationMatchesAmount(ownerClassification as Classification, units)
  ) {
    throw new OpFailure("INVALID_INPUT");
  }

  // An upsert restores a removed record when the provider presents it as
  // current again.
  await db.query(
    `UPDATE ledger.transaction
     SET amount_units = $4, currency_code = $5, currency_scale = $6,
         posting_state = $7, provider_date = $8, posted_date = $9,
         authorized_date = $10, provider_pending_transaction_id = $11,
         description = $12, merchant_name = $13,
         provider_category_code = $14, provider_category_id = $15,
         provider_classification = $16, removed_at = NULL,
         owner_classification = $17, classification_intent = $18,
         classification_inherited_from_id = $19,
         owner_edit_revision = $20,
         revision = revision + 1, updated_at = now()
     WHERE id = $1 AND owner_id = $2 AND connection_id = $3`,
    [
      existing.id,
      input.ownerId,
      input.connectionId,
      units.toString(),
      upsert.currencyCode,
      scale,
      upsert.postingState,
      upsert.providerDate,
      upsert.postedDate,
      upsert.authorizedDate,
      upsert.providerPendingTransactionId,
      upsert.description,
      upsert.merchantName,
      upsert.providerCategoryCode,
      providerCategoryId,
      classification,
      ownerClassification,
      classificationIntent,
      classificationInheritedFrom,
      ownerEditRevision.toString(),
    ],
  );
  return { kind: "updated", changedOwnerField };
}

// Establish supersession links between pending records and their posted
// successors, then copy eligible pending owner edits into untouched
// posted fields as inherited intent.
async function reconcileLinks(
  db: Db,
  input: { ownerId: string; connectionId: string },
  touchedPosted: Set<string>,
  touchedPending: Set<string>,
  conflicts: CorrectionConflict[],
): Promise<void> {
  const candidates = new Set<string>([...touchedPosted, ...touchedPending]);
  if (candidates.size === 0) {
    return;
  }

  // Posted records in this batch that name a pending provider ID, plus
  // any stored posted records naming a pending record this batch added.
  const posted = await db.query<{
    id: string;
    account_id: string;
    provider_transaction_id: string;
    provider_pending_transaction_id: string;
    amount_units: string;
    provider_classification: string | null;
    owner_category_id: string | null;
    category_intent: string;
    owner_classification: string | null;
    classification_intent: string;
    owner_edit_revision: string;
  }>(
    `SELECT id, account_id, provider_transaction_id,
            provider_pending_transaction_id, amount_units,
            provider_classification, owner_category_id, category_intent,
            owner_classification, classification_intent, owner_edit_revision
     FROM ledger.transaction
     WHERE connection_id = $1 AND posting_state = 'posted'
       AND provider_pending_transaction_id IS NOT NULL
       AND removed_at IS NULL`,
    [input.connectionId],
  );

  for (const postedRow of posted.rows) {
    const pendingProviderId = postedRow.provider_pending_transaction_id;
    const pendingRows = await db.query<{
      id: string;
      provider_transaction_id: string;
      account_id: string;
      posting_state: string;
      superseded_by_id: string | null;
      removed_at: Date | null;
      owner_category_id: string | null;
      category_intent: string;
      owner_classification: string | null;
      classification_intent: string;
    }>(
      `SELECT id, provider_transaction_id, account_id, posting_state,
              superseded_by_id, removed_at, owner_category_id,
              category_intent, owner_classification, classification_intent
       FROM ledger.transaction
       WHERE connection_id = $1 AND provider_transaction_id = $2
       FOR UPDATE`,
      [input.connectionId, pendingProviderId],
    );

    const pendingList = pendingRows.rows.filter(
      (row) => row.posting_state === "pending" || row.superseded_by_id !== null,
    );
    if (pendingList.length === 0) {
      continue;
    }
    if (pendingList.length > 1) {
      throw new OpFailure("INVALID_INPUT");
    }
    const pending = pendingList[0];
    if (pending.account_id !== postedRow.account_id) {
      throw new OpFailure("INVALID_INPUT");
    }
    if (pending.id === postedRow.id) {
      throw new OpFailure("INVALID_INPUT");
    }
    if (
      pending.superseded_by_id !== null &&
      pending.superseded_by_id !== postedRow.id
    ) {
      throw new OpFailure("INVALID_INPUT");
    }
    if (pending.superseded_by_id === postedRow.id) {
      continue;
    }

    await db.query(
      `UPDATE ledger.transaction
       SET superseded_by_id = $3, revision = revision + 1, updated_at = now()
       WHERE id = $1 AND connection_id = $2`,
      [pending.id, input.connectionId, postedRow.id],
    );

    // Copy pending owner fields into untouched posted fields.
    let ownerEditRevision = BigInt(postedRow.owner_edit_revision);

    if (
      postedRow.category_intent === "untouched" &&
      pending.owner_category_id !== null &&
      (pending.category_intent === "override" ||
        pending.category_intent === "inherited")
    ) {
      await db.query(
        `UPDATE ledger.transaction
         SET owner_category_id = $3, category_intent = 'inherited',
             category_inherited_from_id = $4,
             owner_edit_revision = $5, revision = revision + 1,
             updated_at = now()
         WHERE id = $1 AND connection_id = $2`,
        [
          postedRow.id,
          input.connectionId,
          pending.owner_category_id,
          pending.id,
          (ownerEditRevision + 1n).toString(),
        ],
      );
      ownerEditRevision += 1n;
    }

    if (
      postedRow.classification_intent === "untouched" &&
      pending.owner_classification !== null &&
      (pending.classification_intent === "override" ||
        pending.classification_intent === "inherited")
    ) {
      const inherited = pending.owner_classification as Classification;
      const amountUnits = BigInt(postedRow.amount_units);
      if (classificationMatchesAmount(inherited, amountUnits)) {
        await db.query(
          `UPDATE ledger.transaction
           SET owner_classification = $3,
               classification_intent = 'inherited',
               classification_inherited_from_id = $4,
               owner_edit_revision = $5, revision = revision + 1,
               updated_at = now()
           WHERE id = $1 AND connection_id = $2`,
          [
            postedRow.id,
            input.connectionId,
            inherited,
            pending.id,
            (ownerEditRevision + 1n).toString(),
          ],
        );
        ownerEditRevision += 1n;
      } else {
        // The inherited classification contradicts the posted sign: keep
        // the posted provider classification, leave the field untouched,
        // and report a correction conflict.
        conflicts.push({
          recordId: postedRow.id,
          field: "classification",
          reason: "inherited_classification_sign_conflict",
          previousSourceId: pending.id,
        });
      }
    }
  }
}
