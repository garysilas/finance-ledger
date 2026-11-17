import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getTransaction,
  listMonthTransactions,
  listTransactionFilterOptions,
} from "./transaction-service";

const OWNER = "11111111-1111-4111-8111-111111111111";
const TXN = "22222222-2222-4222-8222-222222222222";
const URL = "postgresql://app@127.0.0.1:5432/ledger";

// covers spec 0007 AC-3 and AC-10 input guards: malformed input never
// reaches the database. Query behavior (filters, paging, reconciliation)
// runs in test/foundation.transactions.test.ts.
describe("listMonthTransactions input", () => {
  it.each([
    ["a month that is not a calendar month", { month: "2031-13" }],
    ["a non boolean excluded flag", { showExcluded: "yes" }],
    ["a malformed cursor", { cursor: "page-2" }],
    ["a caller supplied extra key", { limit: 5 }],
  ])("rejects %s with INVALID_INPUT", async (_n, extra) => {
    const result = await listMonthTransactions(URL, {
      ownerId: OWNER,
      month: "2031-01",
      showExcluded: false,
      ...extra,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});

describe("getTransaction input", () => {
  it.each([
    ["a non uuid transaction id", { transactionId: "txn-1" }],
    ["a non uuid owner", { ownerId: "me" }],
  ])("rejects %s with INVALID_INPUT", async (_n, extra) => {
    const result = await getTransaction(URL, {
      ownerId: OWNER,
      transactionId: TXN,
      ...extra,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});

describe("listTransactionFilterOptions input", () => {
  it("rejects a non uuid owner with INVALID_INPUT", async () => {
    const result = await listTransactionFilterOptions(URL, { ownerId: "me" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});
