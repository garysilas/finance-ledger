import "server-only";

import { z } from "zod";

import { failure, type ServiceResult } from "./errors";
import { uuid } from "./service";
import { runUnitOfWork } from "@/server/db/finance";

export type OwnerAccountSummary = {
  accountId: string;
  connectionId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  currencyCode: string | null;
  currentUnits: string | null;
  availableUnits: string | null;
  creditLimitUnits: string | null;
  balanceObservedAt: string | null;
};

// Display safe account rows: names, types, and exact balance units with
// the observation instant. No provider identifiers beyond the row id.
export async function listOwnerAccounts(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<OwnerAccountSummary[]>> {
  const parsed = z.object({ ownerId: uuid }).strict().safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      id: string;
      connection_id: string;
      name: string;
      official_name: string | null;
      type: string;
      subtype: string | null;
      currency_code: string | null;
      current_units: string | null;
      available_units: string | null;
      credit_limit_units: string | null;
      balance_observed_at: Date | null;
    }>(
      `SELECT id, connection_id, name, official_name, type, subtype,
              currency_code, current_units, available_units,
              credit_limit_units, balance_observed_at
       FROM ledger.account
       WHERE owner_id = $1 AND archived_at IS NULL
       ORDER BY name, id`,
      [ownerId],
    );
    return rows.rows.map((row) => ({
      accountId: row.id,
      connectionId: row.connection_id,
      name: row.name,
      officialName: row.official_name,
      type: row.type,
      subtype: row.subtype,
      currencyCode: row.currency_code,
      currentUnits: row.current_units,
      availableUnits: row.available_units,
      creditLimitUnits: row.credit_limit_units,
      balanceObservedAt: row.balance_observed_at
        ? row.balance_observed_at.toISOString()
        : null,
    }));
  });
}
