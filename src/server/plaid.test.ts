import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadPlaidSettings,
  normalizeSyncPage,
  type NormalizedSyncPage,
} from "./plaid";

// covers: AC-7 Plaid credentials only in private settings, validated
// lazily; AC-4/AC-6 one sync page normalized into exact batch inputs.
describe("loadPlaidSettings", () => {
  const valid = {
    PLAID_CLIENT_ID: "client-id",
    PLAID_SECRET: "sandbox-secret",
    PLAID_ENV: "sandbox",
  } as unknown as NodeJS.ProcessEnv;

  it("returns client id and secret for valid sandbox settings", () => {
    const result = loadPlaidSettings(valid);
    expect(result).toEqual({
      ok: true,
      value: { clientId: "client-id", secret: "sandbox-secret" },
    });
  });

  it.each([
    ["a missing client id", { ...valid, PLAID_CLIENT_ID: undefined }],
    ["an empty client id", { ...valid, PLAID_CLIENT_ID: "" }],
    ["a missing secret", { ...valid, PLAID_SECRET: undefined }],
    ["an empty secret", { ...valid, PLAID_SECRET: "" }],
    ["no environment", { ...valid, PLAID_ENV: undefined }],
    ["a non sandbox environment", { ...valid, PLAID_ENV: "production" }],
  ])("fails closed with CONFIG_INVALID on %s", (_label, source) => {
    const result = loadPlaidSettings(source as unknown as NodeJS.ProcessEnv);
    expect(result).toEqual({
      ok: false,
      code: "CONFIG_INVALID",
      retryable: false,
    });
  });
});

function txn(over: Record<string, unknown> = {}) {
  return {
    transaction_id: "txn-1",
    account_id: "acct-1",
    amount: 12.34,
    iso_currency_code: "USD",
    date: "2031-01-15",
    datetime: "2031-01-15T10:00:00Z",
    authorized_datetime: "2031-01-14T22:00:00Z",
    pending: false,
    pending_transaction_id: null,
    name: "Coffee Shop",
    merchant_name: "Coffee Shop LLC",
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
    },
    ...over,
  };
}

function account(over: Record<string, unknown> = {}) {
  return {
    account_id: "acct-1",
    name: "Checking",
    official_name: "Everyday Checking",
    type: "depository",
    subtype: "checking",
    balances: {
      iso_currency_code: "USD",
      unofficial_currency_code: null,
      current: 1000.5,
      available: 900.25,
      limit: null,
    },
    ...over,
  };
}

function page(over: Record<string, unknown> = {}) {
  return {
    added: [],
    modified: [],
    removed: [],
    accounts: [],
    next_cursor: "cursor-2",
    has_more: true,
    ...over,
  } as unknown as Parameters<typeof normalizeSyncPage>[0];
}

function unwrap(result: ReturnType<typeof normalizeSyncPage>) {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.code}`);
  }
  return result.value as NormalizedSyncPage;
}

describe("normalizeSyncPage", () => {
  it("maps a posted transaction to exact batch fields", () => {
    const normalized = unwrap(normalizeSyncPage(page({ added: [txn()] })));
    expect(normalized.nextCursor).toBe("cursor-2");
    expect(normalized.transactionUpserts).toHaveLength(1);
    expect(normalized.transactionUpserts[0]).toEqual({
      providerTransactionId: "txn-1",
      providerAccountId: "acct-1",
      amount: "12.34",
      currencyCode: "USD",
      postingState: "posted",
      providerDate: "2031-01-15",
      postedDate: "2031-01-15",
      authorizedDate: "2031-01-14",
      providerPendingTransactionId: null,
      description: "Coffee Shop",
      merchantName: "Coffee Shop LLC",
      providerCategoryCode: "FOOD_AND_DRINK_COFFEE",
      providerCategoryStableKey: "dining",
      providerClassification: "spending",
    });
  });

  it("maps a pending transaction without a posted date", () => {
    const normalized = unwrap(
      normalizeSyncPage(page({ added: [txn({ pending: true })] })),
    );
    const upsert = normalized.transactionUpserts[0];
    expect(upsert.postingState).toBe("pending");
    expect(upsert.postedDate).toBeNull();
    expect(upsert.providerDate).toBe("2031-01-15");
  });

  it("keeps the exact decimal string, never a float", () => {
    const normalized = unwrap(
      normalizeSyncPage(page({ added: [txn({ amount: 0.1 })] })),
    );
    expect(normalized.transactionUpserts[0].amount).toBe("0.1");
  });

  it("treats modified entries as upserts alongside added", () => {
    const normalized = unwrap(
      normalizeSyncPage(
        page({
          added: [txn({ transaction_id: "txn-add" })],
          modified: [txn({ transaction_id: "txn-mod" })],
        }),
      ),
    );
    expect(
      normalized.transactionUpserts.map((t) => t.providerTransactionId),
    ).toEqual(["txn-add", "txn-mod"]);
  });

  it("collects removed transaction ids and drops empty ones", () => {
    const normalized = unwrap(
      normalizeSyncPage(
        page({
          removed: [
            { transaction_id: "txn-gone" },
            { transaction_id: "" },
            { transaction_id: null },
          ],
        }),
      ),
    );
    expect(normalized.removalIds).toEqual(["txn-gone"]);
  });

  it("maps account balances to observation fields", () => {
    const normalized = unwrap(
      normalizeSyncPage(page({ accounts: [account()] })),
    );
    expect(normalized.accountObservations).toHaveLength(1);
    expect(normalized.accountObservations[0]).toMatchObject({
      providerAccountId: "acct-1",
      name: "Checking",
      officialName: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      currencyCode: "USD",
      current: "1000.5",
      available: "900.25",
      creditLimit: null,
    });
  });

  it("falls back to the unofficial currency code on account balances", () => {
    const normalized = unwrap(
      normalizeSyncPage(
        page({
          accounts: [
            account({
              balances: {
                iso_currency_code: null,
                unofficial_currency_code: "USD",
                current: 1,
                available: null,
                limit: null,
              },
            }),
          ],
        }),
      ),
    );
    expect(normalized.accountObservations[0].currencyCode).toBe("USD");
  });

  it.each([
    [
      "a non USD transaction",
      txn({ iso_currency_code: "EUR" }),
      "UNSUPPORTED_MONEY",
    ],
    ["a missing amount", txn({ amount: null }), "INVALID_INPUT"],
    [
      "more precision than the scale",
      txn({ amount: 1.005 }),
      "UNSUPPORTED_MONEY",
    ],
    ["an invalid provider date", txn({ date: "15-01-2031" }), "INVALID_INPUT"],
  ])(
    "fails the whole page on %s so the cursor never advances",
    (_label, bad, code) => {
      const result = normalizeSyncPage(page({ added: [bad] }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(code);
      }
    },
  );
});
