import "server-only";

import { z } from "zod";

import { UNCATEGORIZED_STABLE_KEY } from "./classification";
import { monthOfInstant, monthStart, parseMonth } from "./dates";
import { failure, type ServiceResult } from "./errors";
import {
  COUNTING_SQL,
  EXCLUSION_REASON_SQL,
  monthCandidate,
} from "./month-query";
import { uuid } from "./service";
import { runUnitOfWork, OpFailure } from "@/server/db/finance";

const inputSchema = z
  .object({
    ownerId: uuid,
    month: z
      .string()
      .refine((value) => parseMonth(value) !== null)
      .optional(),
  })
  .strict();

export type BudgetStatus = "absent" | "under" | "at_limit" | "over";

export type MonthlyCategory = {
  categoryId: string;
  stableKey: string;
  label: string;
  spentUnits: string;
  postedCount: number;
  budget: {
    limitUnits: string;
    remainingUnits: string;
    status: Exclude<BudgetStatus, "absent">;
  } | null;
};

export type MonthlySpendingResult = {
  month: string;
  timeZone: string;
  postedTotalUnits: string;
  pendingOutflowUnits: string;
  pendingRefundUnits: string;
  categories: MonthlyCategory[];
  // Each excluded row counts in exactly one bucket, by the same
  // precedence as the transaction table's exclusion badge.
  exclusions: {
    foreignCurrency: number;
    unclassifiedInflow: number;
    unclassifiedOutflow: number;
    income: number;
    transfer: number;
    cardPayment: number;
    removed: number;
    superseded: number;
  };
  coverage: {
    missingBalances: number;
    nonUsdBalances: number;
    connections: {
      connectionId: string;
      state: string;
      lastSuccessfulSyncAt: string | null;
    }[];
    historyCompleteness: "unknown" | "partial" | "complete";
  };
};

// One consistent snapshot of a month: exact posted totals by effective
// category, separate pending buckets, exclusion counts, and coverage
// metadata. No cached aggregates, no float arithmetic; sums run as
// Postgres numeric and serialize as unrestricted integer strings.
export async function getMonthlySpending(
  databaseUrl: string,
  rawInput: unknown,
  clock: () => Date = () => new Date(),
): Promise<ServiceResult<MonthlySpendingResult>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;

  return runUnitOfWork(databaseUrl, async (db) => {
    const owners = await db.query<{ time_zone: string }>(
      "SELECT time_zone FROM ledger.owner WHERE id = $1",
      [input.ownerId],
    );
    if (owners.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    const timeZone = owners.rows[0].time_zone;

    const monthValue = input.month ?? monthOfInstant(clock(), timeZone);
    const bounds = parseMonth(monthValue);
    const candidate = monthCandidate(monthValue);
    if (!bounds || !candidate) {
      throw new OpFailure("INVALID_INPUT");
    }
    const monthDate = monthStart(bounds.year, bounds.month);

    const uncat = await db.query<{ id: string }>(
      `SELECT id FROM ledger.category
       WHERE owner_id = $1 AND stable_key = $2`,
      [input.ownerId, UNCATEGORIZED_STABLE_KEY],
    );
    const uncategorizedId = uncat.rows[0]?.id ?? null;

    const postedRows = await db.query<{
      category_id: string;
      label: string;
      stable_key: string;
      total: string;
      posted_count: string;
    }>(
      `SELECT COALESCE(t.owner_category_id, t.provider_category_id, $4) AS category_id,
              c.label, c.stable_key,
              SUM(t.amount_units::numeric) AS total,
              COUNT(*) AS posted_count
       FROM ledger."transaction" t
       LEFT JOIN ledger.category c
         ON c.id = COALESCE(t.owner_category_id, t.provider_category_id, $4)
       WHERE t.owner_id = $1
         AND ${COUNTING_SQL}
         AND ${candidate.posted}
       GROUP BY 1, 2, 3`,
      [input.ownerId, candidate.lower, candidate.upper, uncategorizedId],
    );

    const pendingRows = await db.query<{
      effective: string;
      total: string;
    }>(
      `SELECT COALESCE(t.owner_classification, t.provider_classification) AS effective,
              SUM(t.amount_units::numeric) AS total
       FROM ledger."transaction" t
       WHERE t.owner_id = $1
         AND ${COUNTING_SQL}
         AND ${candidate.pending}
       GROUP BY 1`,
      [input.ownerId, candidate.lower, candidate.upper],
    );

    const exclusionRows = await db.query<{ reason: string; n: string }>(
      `SELECT ${EXCLUSION_REASON_SQL} AS reason, COUNT(*) AS n
       FROM ledger."transaction" t
       WHERE t.owner_id = $1
         AND ${candidate.either}
         AND NOT ${COUNTING_SQL}
       GROUP BY 1`,
      [input.ownerId, candidate.lower, candidate.upper],
    );

    const budgetRows = await db.query<{
      category_id: string;
      label: string;
      stable_key: string;
      limit_units: string;
    }>(
      `SELECT b.category_id, c.label, c.stable_key, b.limit_units
       FROM ledger.budget b
       JOIN ledger.category c
         ON c.owner_id = b.owner_id AND c.id = b.category_id
       WHERE b.owner_id = $1 AND b.month = $2`,
      [input.ownerId, monthDate],
    );

    const coverageRows = await db.query<{
      missing: string;
      nonusd: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE current_units IS NULL) AS missing,
         COUNT(*) FILTER (
           WHERE currency_code IS NULL OR currency_code <> 'USD'
         ) AS nonusd
       FROM ledger.account
       WHERE owner_id = $1 AND archived_at IS NULL`,
      [input.ownerId],
    );

    const connectionRows = await db.query<{
      id: string;
      state: string;
      last_successful_sync_at: Date | null;
      history_complete: boolean;
    }>(
      `SELECT id, state, last_successful_sync_at, history_complete
       FROM ledger.connection WHERE owner_id = $1 ORDER BY id`,
      [input.ownerId],
    );

    const categories = new Map<string, MonthlyCategory>();
    let postedTotal = 0n;
    for (const row of postedRows.rows) {
      const total = BigInt(row.total);
      postedTotal += total;
      categories.set(row.category_id, {
        categoryId: row.category_id,
        stableKey: row.stable_key,
        label: row.label,
        spentUnits: total.toString(),
        postedCount: Number(row.posted_count),
        budget: null,
      });
    }
    for (const row of budgetRows.rows) {
      const existing = categories.get(row.category_id);
      const spent = existing ? BigInt(existing.spentUnits) : 0n;
      const limit = BigInt(row.limit_units);
      const remaining = limit - spent;
      const status =
        spent < limit ? "under" : spent === limit ? "at_limit" : "over";
      categories.set(row.category_id, {
        categoryId: row.category_id,
        stableKey: row.stable_key,
        label: row.label,
        spentUnits: spent.toString(),
        postedCount: existing?.postedCount ?? 0,
        budget: {
          limitUnits: limit.toString(),
          remainingUnits: remaining.toString(),
          status,
        },
      });
    }

    let pendingOutflow = 0n;
    let pendingRefund = 0n;
    for (const row of pendingRows.rows) {
      if (row.effective === "spending") {
        pendingOutflow += BigInt(row.total);
      } else if (row.effective === "refund") {
        pendingRefund += BigInt(row.total);
      }
    }

    const exclusions = new Map(
      exclusionRows.rows.map((row) => [row.reason, Number(row.n)]),
    );
    const coverage = coverageRows.rows[0];

    return {
      month: monthValue,
      timeZone,
      postedTotalUnits: postedTotal.toString(),
      pendingOutflowUnits: pendingOutflow.toString(),
      pendingRefundUnits: pendingRefund.toString(),
      categories: [...categories.values()].sort((a, b) =>
        a.stableKey.localeCompare(b.stableKey),
      ),
      exclusions: {
        foreignCurrency: exclusions.get("foreign_currency") ?? 0,
        unclassifiedInflow: exclusions.get("unclassified_inflow") ?? 0,
        unclassifiedOutflow: exclusions.get("unclassified_outflow") ?? 0,
        income: exclusions.get("income") ?? 0,
        transfer: exclusions.get("transfer") ?? 0,
        cardPayment: exclusions.get("card_payment") ?? 0,
        removed: exclusions.get("removed") ?? 0,
        superseded: exclusions.get("superseded") ?? 0,
      },
      coverage: {
        missingBalances: Number(coverage.missing),
        nonUsdBalances: Number(coverage.nonusd),
        connections: connectionRows.rows.map((row) => ({
          connectionId: row.id,
          state: row.state,
          lastSuccessfulSyncAt: row.last_successful_sync_at
            ? row.last_successful_sync_at.toISOString()
            : null,
        })),
        historyCompleteness:
          connectionRows.rows.length === 0
            ? "unknown"
            : connectionRows.rows.every((row) => row.history_complete)
              ? "complete"
              : "partial",
      },
    };
  });
}
