import "server-only";

import { z } from "zod";

import { failure, type ServiceResult } from "./errors";
import { uuid } from "./service";
import { runUnitOfWork } from "@/server/db/finance";

export type NetWorthCoverage = {
  accountId: string;
  name: string;
  reason: "no_balance" | "foreign_currency" | "archived";
};

export type NetWorthResult = {
  netWorthUnits: string;
  assetUnits: string;
  liabilityUnits: string;
  coverage: NetWorthCoverage[];
};

const ASSET_TYPES = new Set(["depository", "investment"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

// Net worth is assets (depository, investment) minus liabilities (credit,
// loan) from current balances. Only USD accounts with a current balance
// enter the total; archived, non USD, or balance-less accounts are listed
// under the coverage notice rather than guessed.
export async function getNetWorth(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<NetWorthResult>> {
  const parsed = z.object({ ownerId: uuid }).strict().safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      id: string;
      name: string;
      type: string;
      currency_code: string | null;
      current_units: string | null;
      archived_at: Date | null;
    }>(
      `SELECT id, name, type, currency_code, current_units, archived_at
       FROM ledger.account
       WHERE owner_id = $1
       ORDER BY name, id`,
      [ownerId],
    );

    let assets = 0n;
    let liabilities = 0n;
    const coverage: NetWorthCoverage[] = [];
    for (const row of rows.rows) {
      const reason: NetWorthCoverage["reason"] | null =
        row.archived_at !== null
          ? "archived"
          : row.currency_code !== "USD"
            ? "foreign_currency"
            : row.current_units === null
              ? "no_balance"
              : null;
      if (reason !== null) {
        coverage.push({ accountId: row.id, name: row.name, reason });
        continue;
      }
      const units = BigInt(row.current_units as string);
      if (ASSET_TYPES.has(row.type)) {
        assets += units;
      } else if (LIABILITY_TYPES.has(row.type)) {
        liabilities += units;
      }
    }

    return {
      netWorthUnits: (assets - liabilities).toString(),
      assetUnits: assets.toString(),
      liabilityUnits: liabilities.toString(),
      coverage,
    };
  });
}
