import "server-only";

import { z } from "zod";

import { parseMonth } from "./dates";
import { failure, type ServiceResult } from "./errors";
import {
  COUNTING_SQL,
  EFFECTIVE_CLASSIFICATION_SQL,
  EFFECTIVE_DATE_SQL,
  EXCLUSION_REASON_SQL,
  monthCandidate,
} from "./month-query";
import { uuid } from "./service";
import {
  CURSOR_PATTERN,
  PAGE_SIZE,
  SEARCH_MAX_LENGTH,
  UNCATEGORIZED_PARAM,
  decodeCursor,
  encodeCursor,
  escapeLike,
  normalizeSearch,
  type ExclusionReason,
  type TransactionPage,
  type TransactionRow,
} from "./transaction-params";
import type { Classification } from "./classification";
import { OpFailure, runUnitOfWork, type Db } from "@/server/db/finance";

const EFFECTIVE_CATEGORY_SQL = `COALESCE(t.owner_category_id, t.provider_category_id, u.id)`;

// Every read joins the owner's account and the Uncategorized category so
// rows and filters resolve the same effective category the summary uses.
const FROM_SQL = `FROM ledger."transaction" t
  JOIN ledger.account a ON a.owner_id = t.owner_id AND a.id = t.account_id
  LEFT JOIN ledger.category u
    ON u.owner_id = t.owner_id AND u.stable_key = '${UNCATEGORIZED_PARAM}'
  LEFT JOIN ledger.category c
    ON c.owner_id = t.owner_id AND c.id = ${EFFECTIVE_CATEGORY_SQL}`;

const SELECT_SQL = `SELECT t.id,
  ${EFFECTIVE_DATE_SQL}::text AS effective_date,
  t.posting_state, t.description, t.merchant_name,
  t.account_id, a.name AS account_name, a.subtype AS account_subtype,
  t.amount_units::text AS amount_units, t.currency_code,
  ${EFFECTIVE_CATEGORY_SQL} AS category_id, c.label AS category_label,
  ${EFFECTIVE_CLASSIFICATION_SQL} AS classification,
  (t.category_intent <> 'untouched' OR t.classification_intent <> 'untouched') AS edited,
  ${EXCLUSION_REASON_SQL} AS exclusion_reason,
  t.owner_edit_revision::text AS owner_edit_revision`;

type RowRecord = {
  id: string;
  effective_date: string;
  posting_state: "pending" | "posted";
  description: string;
  merchant_name: string | null;
  account_id: string;
  account_name: string;
  account_subtype: string | null;
  amount_units: string;
  currency_code: string;
  category_id: string | null;
  category_label: string | null;
  classification: string | null;
  edited: boolean;
  exclusion_reason: string | null;
  owner_edit_revision: string;
};

function toRow(record: RowRecord): TransactionRow {
  const reason = record.exclusion_reason as ExclusionReason | null;
  return {
    id: record.id,
    date: record.effective_date,
    postingState: record.posting_state,
    description: record.description,
    merchantName: record.merchant_name,
    accountId: record.account_id,
    accountName: record.account_name,
    accountSubtype: record.account_subtype,
    amountUnits: record.amount_units,
    currencyCode: record.currency_code,
    categoryId: record.category_id,
    categoryLabel: record.category_label,
    classification: (record.classification ?? "unclassified") as Classification,
    edited: record.edited,
    exclusionReason: reason,
    editable: reason !== "removed" && reason !== "superseded",
    ownerEditRevision: record.owner_edit_revision,
  };
}

const listSchema = z
  .object({
    ownerId: uuid,
    month: z.string().refine((value) => parseMonth(value) !== null),
    categoryId: z.union([uuid, z.literal(UNCATEGORIZED_PARAM)]).optional(),
    accountId: uuid.optional(),
    query: z
      .string()
      .max(SEARCH_MAX_LENGTH * 4)
      .optional(),
    showExcluded: z.boolean(),
    cursor: z.string().regex(CURSOR_PATTERN).optional(),
  })
  .strict();

export type ListMonthTransactionsInput = z.input<typeof listSchema>;

async function ownerHasRow(
  db: Db,
  table: "category" | "account",
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM ledger.${table} WHERE owner_id = $1 AND id = $2`,
    [ownerId, id],
  );
  return rows.rows.length > 0;
}

// One page of the selected month, newest effective date first, plus the
// count and posted sum of the whole matching set. The month candidate
// predicate and counting rule are the summary's own, so with no filters
// the posted sum equals the month's posted total.
export async function listMonthTransactions(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<TransactionPage>> {
  const parsed = listSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  const candidate = monthCandidate(input.month);
  if (!candidate) {
    return failure("INVALID_INPUT");
  }

  return runUnitOfWork(databaseUrl, async (db) => {
    if (
      input.categoryId !== undefined &&
      input.categoryId !== UNCATEGORIZED_PARAM &&
      !(await ownerHasRow(db, "category", input.ownerId, input.categoryId))
    ) {
      throw new OpFailure("NOT_FOUND");
    }
    if (
      input.accountId !== undefined &&
      !(await ownerHasRow(db, "account", input.ownerId, input.accountId))
    ) {
      throw new OpFailure("NOT_FOUND");
    }

    const params: unknown[] = [input.ownerId, candidate.lower, candidate.upper];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where = [`t.owner_id = $1`, candidate.either];
    if (!input.showExcluded) {
      where.push(COUNTING_SQL);
    }
    if (input.categoryId === UNCATEGORIZED_PARAM) {
      where.push(`${EFFECTIVE_CATEGORY_SQL} = u.id`);
    } else if (input.categoryId !== undefined) {
      where.push(`${EFFECTIVE_CATEGORY_SQL} = ${bind(input.categoryId)}::uuid`);
    }
    if (input.accountId !== undefined) {
      where.push(`t.account_id = ${bind(input.accountId)}::uuid`);
    }
    const search = normalizeSearch(input.query);
    if (search !== null) {
      const pattern = bind(`%${escapeLike(search)}%`);
      where.push(
        `(t.description ILIKE ${pattern} ESCAPE '\\' OR t.merchant_name ILIKE ${pattern} ESCAPE '\\')`,
      );
    }
    const filterSql = where.join(" AND ");

    const totals = await db.query<{ n: string; posted: string }>(
      `SELECT COUNT(*)::text AS n,
              COALESCE(SUM(t.amount_units::numeric) FILTER (
                WHERE t.posting_state = 'posted' AND ${COUNTING_SQL}
              ), 0)::text AS posted
       ${FROM_SQL}
       WHERE ${filterSql}`,
      params,
    );

    const pageParams = [...params];
    let keyset = "";
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    if (cursor) {
      pageParams.push(cursor.date, cursor.id);
      keyset = ` AND (${EFFECTIVE_DATE_SQL}, t.id) < ($${pageParams.length - 1}::date, $${pageParams.length}::uuid)`;
    }
    pageParams.push(PAGE_SIZE + 1);
    const page = await db.query<RowRecord>(
      `${SELECT_SQL}
       ${FROM_SQL}
       WHERE ${filterSql}${keyset}
       ORDER BY ${EFFECTIVE_DATE_SQL} DESC, t.id DESC
       LIMIT $${pageParams.length}`,
      pageParams,
    );

    const rows = page.rows.slice(0, PAGE_SIZE).map(toRow);
    const last = rows.at(-1);
    return {
      rows,
      nextCursor:
        page.rows.length > PAGE_SIZE && last
          ? encodeCursor(last.date, last.id)
          : null,
      matchCount: Number(totals.rows[0].n),
      filteredPostedUnits: totals.rows[0].posted,
    };
  });
}

// One owner scoped row in the table's shape, for refreshing a row after
// an edit conflict.
export async function getTransaction(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<TransactionRow>> {
  const parsed = z
    .object({ ownerId: uuid, transactionId: uuid })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<RowRecord>(
      `${SELECT_SQL}
       ${FROM_SQL}
       WHERE t.owner_id = $1 AND t.id = $2`,
      [input.ownerId, input.transactionId],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    return toRow(rows.rows[0]);
  });
}

export type FilterOptions = {
  categories: {
    id: string;
    stableKey: string;
    label: string;
    archived: boolean;
  }[];
  accounts: {
    id: string;
    name: string;
    subtype: string | null;
    archived: boolean;
  }[];
};

// Every owner category and account, archived ones flagged, for the
// filter controls, URL validation, and the edit picker (which offers
// active categories only).
export async function listTransactionFilterOptions(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<FilterOptions>> {
  const parsed = z.object({ ownerId: uuid }).strict().safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const categories = await db.query<{
      id: string;
      stable_key: string;
      label: string;
      archived: boolean;
    }>(
      `SELECT id, stable_key, label, archived_at IS NOT NULL AS archived
       FROM ledger.category WHERE owner_id = $1
       ORDER BY label, id`,
      [ownerId],
    );
    const accounts = await db.query<{
      id: string;
      name: string;
      subtype: string | null;
      archived: boolean;
    }>(
      `SELECT id, name, subtype, archived_at IS NOT NULL AS archived
       FROM ledger.account WHERE owner_id = $1
       ORDER BY name, id`,
      [ownerId],
    );
    return {
      categories: categories.rows.map((row) => ({
        id: row.id,
        stableKey: row.stable_key,
        label: row.label,
        archived: row.archived,
      })),
      accounts: accounts.rows,
    };
  });
}
