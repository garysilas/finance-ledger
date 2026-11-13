import "server-only";

import { z } from "zod";

import { UNCATEGORIZED_STABLE_KEY } from "./classification";
import {
  monthEnd,
  monthOfInstant,
  monthStart,
  nextMonthStart,
  parseMonth,
} from "./dates";
import { failure, type ServiceResult } from "./errors";
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
  exclusions: {
    foreignCurrency: number;
    unclassifiedInflow: number;
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
    historyCompleteness: "unknown";
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
    if (!bounds) {
      throw new OpFailure("INVALID_INPUT");
    }
    const start = monthStart(bounds.year, bounds.month);
    const next = nextMonthStart(bounds.year, bounds.month);
    const end = monthEnd(bounds.year, bounds.month);
    const monthDate = start;

    const candidate = monthCandidatePredicate(next === null, [
      start,
      next ?? end,
    ]);

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
    }>(
      `SELECT COALESCE(t.owner_category_id, t.provider_category_id, $4) AS category_id,
              c.label, c.stable_key,
              SUM(t.amount_units::numeric) AS total
       FROM ledger."transaction" t
       LEFT JOIN ledger.category c
         ON c.id = COALESCE(t.owner_category_id, t.provider_category_id, $4)
       WHERE t.owner_id = $1
         AND t.posting_state = 'posted'
         AND t.removed_at IS NULL
         AND t.superseded_by_id IS NULL
         AND t.currency_code = 'USD'
         AND COALESCE(t.owner_classification, t.provider_classification)
             IN ('spending', 'refund')
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
         AND t.posting_state = 'pending'
         AND t.removed_at IS NULL
         AND t.superseded_by_id IS NULL
         AND t.currency_code = 'USD'
         AND COALESCE(t.owner_classification, t.provider_classification)
             IN ('spending', 'refund')
         AND ${candidate.pending}
       GROUP BY 1`,
      [input.ownerId, candidate.lower, candidate.upper],
    );

    const exclusionRows = await db.query<{
      foreign_currency: string;
      unclassified_inflow: string;
      transfer: string;
      card_payment: string;
      removed: string;
      superseded: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE t.currency_code <> 'USD') AS foreign_currency,
         COUNT(*) FILTER (
           WHERE COALESCE(t.owner_classification, t.provider_classification)
                 = 'unclassified' AND t.amount_units < 0
         ) AS unclassified_inflow,
         COUNT(*) FILTER (
           WHERE COALESCE(t.owner_classification, t.provider_classification)
                 = 'transfer'
         ) AS transfer,
         COUNT(*) FILTER (
           WHERE COALESCE(t.owner_classification, t.provider_classification)
                 = 'card_payment'
         ) AS card_payment,
         COUNT(*) FILTER (WHERE t.removed_at IS NOT NULL) AS removed,
         COUNT(*) FILTER (WHERE t.superseded_by_id IS NOT NULL) AS superseded
       FROM ledger."transaction" t
       WHERE t.owner_id = $1
         AND (${candidate.posted} OR ${candidate.pending})`,
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
    }>(
      `SELECT id, state, last_successful_sync_at
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

    const exclusions = exclusionRows.rows[0];
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
        foreignCurrency: Number(exclusions.foreign_currency),
        unclassifiedInflow: Number(exclusions.unclassified_inflow),
        transfer: Number(exclusions.transfer),
        cardPayment: Number(exclusions.card_payment),
        removed: Number(exclusions.removed),
        superseded: Number(exclusions.superseded),
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
        historyCompleteness: "unknown",
      },
    };
  });
}

// Monthly candidate predicate: posted rows join by posted_date, pending
// rows by provider_date. The final month of year 9999 uses an inclusive
// end date rather than an out-of-range next month.
function monthCandidatePredicate(
  inclusiveEnd: boolean,
  bounds: [string, string],
): { posted: string; pending: string; lower: string; upper: string } {
  const [lower, upper] = bounds;
  const posted = inclusiveEnd
    ? `(t.posting_state = 'posted' AND t.posted_date >= $2 AND t.posted_date <= $3)`
    : `(t.posting_state = 'posted' AND t.posted_date >= $2 AND t.posted_date < $3)`;
  const pending = inclusiveEnd
    ? `(t.posting_state = 'pending' AND t.provider_date >= $2 AND t.provider_date <= $3)`
    : `(t.posting_state = 'pending' AND t.provider_date >= $2 AND t.provider_date < $3)`;
  return { posted, pending, lower, upper };
}
