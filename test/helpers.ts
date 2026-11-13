// Shared fixtures for the isolated database suite. Each test file must
// mock "server-only" itself before importing helpers that load services.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

import { initializeOwner } from "@/features/finance/owner-service";
import { createConnection } from "@/features/finance/connection-service";
import { applyProviderBatch } from "@/features/finance/batch-service";
import { getMonthlySpending } from "@/features/finance/spending-service";
import { getConnectionSyncState } from "@/features/finance/connection-service";

let keyDir: string | null = null;

// Token operations need a real key file outside the repository. Create
// one throwaway key per test run and point the settings at it.
export function ensureTestKey(): void {
  if (!keyDir) {
    keyDir = mkdtempSync(join(tmpdir(), "ledger-foundation-key-"));
    writeFileSync(
      join(keyDir, "token.key"),
      randomBytes(32).toString("base64"),
      { mode: 0o600 },
    );
  }
  process.env.LEDGER_TOKEN_KEY_PATH = join(keyDir, "token.key");
  process.env.LEDGER_TOKEN_KEY_ID = "foundation-test-key";
}

export async function initOwner(url: string): Promise<string> {
  const result = await initializeOwner(url, {
    ownerId: randomUUID(),
    requestId: randomUUID(),
  });
  if (!result.ok) {
    throw new Error(`initializeOwner failed: ${result.code}`);
  }
  return result.value.value!.ownerId;
}

export async function makeConnection(
  url: string,
  ownerId: string,
): Promise<string> {
  const result = await createConnection(url, {
    ownerId,
    provider: "plaid",
    environment: "sandbox",
    providerItemId: `item-${randomUUID()}`,
    institutionId: "ins_test",
    institutionName: "Test Bank",
    tokenPlaintext: `token-${randomUUID()}`,
    requestId: randomUUID(),
  });
  if (!result.ok) {
    throw new Error(`createConnection failed: ${result.code}`);
  }
  return result.value.value!.connectionId;
}

export function acctObs(
  providerAccountId: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    providerAccountId,
    name: `Account ${providerAccountId}`,
    officialName: null,
    type: "depository",
    subtype: "checking",
    currencyCode: "USD",
    current: "1000.00",
    available: "900.00",
    creditLimit: null,
    balanceObservedAt: "2031-01-01T00:00:00Z",
    ...over,
  };
}

export function postedTxn(
  providerTransactionId: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    providerTransactionId,
    providerAccountId: "acct-a",
    amount: "5.00",
    currencyCode: "USD",
    postingState: "posted",
    providerDate: "2031-01-15",
    postedDate: "2031-01-15",
    authorizedDate: null,
    providerPendingTransactionId: null,
    description: `posted ${providerTransactionId}`,
    merchantName: null,
    providerCategoryCode: null,
    providerCategoryStableKey: null,
    providerClassification: "spending",
    ...over,
  };
}

export function pendingTxn(
  providerTransactionId: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    providerTransactionId,
    providerAccountId: "acct-a",
    amount: "5.00",
    currencyCode: "USD",
    postingState: "pending",
    providerDate: "2031-01-15",
    postedDate: null,
    authorizedDate: null,
    providerPendingTransactionId: null,
    description: `pending ${providerTransactionId}`,
    merchantName: null,
    providerCategoryCode: null,
    providerCategoryStableKey: null,
    providerClassification: "spending",
    ...over,
  };
}

export async function applyBatch(
  url: string,
  args: {
    ownerId: string;
    connectionId: string;
    expectedCursor: string | null;
    nextCursor?: string;
    accountObservations?: Record<string, unknown>[];
    transactionUpserts?: Record<string, unknown>[];
    removalIds?: string[];
    requestId?: string;
  },
) {
  return applyProviderBatch(url, {
    ownerId: args.ownerId,
    connectionId: args.connectionId,
    expectedCursor: args.expectedCursor,
    nextCursor: args.nextCursor ?? `cursor-${randomUUID()}`,
    accountObservations: args.accountObservations ?? [acctObs("acct-a")],
    transactionUpserts: args.transactionUpserts ?? [],
    removalIds: args.removalIds ?? [],
    requestId: args.requestId ?? randomUUID(),
  });
}

export async function monthlySpending(
  url: string,
  ownerId: string,
  month: string,
) {
  const result = await getMonthlySpending(url, { ownerId, month });
  if (!result.ok) {
    throw new Error(`getMonthlySpending failed: ${result.code}`);
  }
  return result.value;
}

export async function syncState(
  url: string,
  ownerId: string,
  connectionId: string,
) {
  const result = await getConnectionSyncState(url, { ownerId, connectionId });
  if (!result.ok) {
    throw new Error(`getConnectionSyncState failed: ${result.code}`);
  }
  return result.value;
}

// Narrow raw reads for state the services never return (internal ids,
// intent fields, receipts, audit). Uses the application role, never
// the migration role.
export async function q<T extends pg.QueryResultRow>(
  url: string,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

export async function txnRow(
  url: string,
  connectionId: string,
  providerTransactionId: string,
) {
  const rows = await q<{
    id: string;
    amount_units: string;
    posting_state: string;
    removed_at: Date | null;
    superseded_by_id: string | null;
    owner_category_id: string | null;
    owner_classification: string | null;
    category_intent: string;
    classification_intent: string;
    owner_edit_revision: string;
    provider_classification: string | null;
  }>(
    url,
    `SELECT id, amount_units, posting_state, removed_at, superseded_by_id,
            owner_category_id, owner_classification, category_intent,
            classification_intent, owner_edit_revision,
            provider_classification
     FROM ledger.transaction
     WHERE connection_id = $1 AND provider_transaction_id = $2`,
    [connectionId, providerTransactionId],
  );
  return rows[0];
}

export async function categoryId(
  url: string,
  ownerId: string,
  stableKey: string,
): Promise<string> {
  const rows = await q<{ id: string }>(
    url,
    "SELECT id FROM ledger.category WHERE owner_id = $1 AND stable_key = $2",
    [ownerId, stableKey],
  );
  return rows[0].id;
}

// Archive persists across runs, so tests cannot assume a revision.
// Reads the current revision and archives only when needed.
export async function ensureArchived(
  url: string,
  ownerId: string,
  stableKey: string,
): Promise<string> {
  const { archiveCategory } =
    await import("@/features/finance/category-service");
  const id = await categoryId(url, ownerId, stableKey);
  const rows = await q<{ archived_at: Date | null; revision: string }>(
    url,
    "SELECT archived_at, revision FROM ledger.category WHERE id = $1",
    [id],
  );
  if (rows[0].archived_at !== null) {
    return id;
  }
  const result = await archiveCategory(url, {
    ownerId,
    categoryId: id,
    expectedRevision: rows[0].revision,
    requestId: randomUUID(),
  });
  if (!result.ok) {
    throw new Error(`archiveCategory failed: ${result.code}`);
  }
  return id;
}

export async function auditCount(
  url: string,
  ownerId: string,
  requestId: string,
): Promise<number> {
  const rows = await q<{ n: string }>(
    url,
    `SELECT COUNT(*) AS n FROM ledger.audit a
     JOIN ledger.request_receipt r ON r.id = a.receipt_id
     WHERE a.owner_id = $1 AND r.request_id = $2`,
    [ownerId, requestId],
  );
  return Number(rows[0].n);
}
