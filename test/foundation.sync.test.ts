// Beta regression suite for spec 0006 drain sync (AC-1). A drain that
// resumes from a committed cursor and reaches the end must mark
// history_complete: the cursor only advances on committed pages, so a
// finished drain means the whole chain from the start is stored.
// Runs against the isolated test database; skipped when unset.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const transactionsSync = vi.hoisted(() => vi.fn());
const itemWebhookUpdate = vi.hoisted(() => vi.fn());

vi.mock("plaid", async (importOriginal) => {
  const mod = await importOriginal<typeof import("plaid")>();
  return {
    ...mod,
    PlaidApi: vi.fn().mockImplementation(function (this: object) {
      return { transactionsSync, itemWebhookUpdate };
    }),
  };
});

import { drainConnectionSync } from "@/server/plaid";
import { listOwnerConnections } from "@/features/finance/connection-service";
import { ensureTestKey, initOwner, makeConnection } from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";

function txnPage(over: Record<string, unknown> = {}) {
  return {
    data: {
      added: [
        {
          transaction_id: `txn-${randomUUID()}`,
          account_id: "acct-a",
          amount: 5,
          iso_currency_code: "USD",
          date: "2031-01-15",
          datetime: "2031-01-15T10:00:00Z",
          authorized_datetime: null,
          pending: false,
          pending_transaction_id: null,
          name: "Coffee Shop",
          merchant_name: null,
          personal_finance_category: {
            primary: "FOOD_AND_DRINK",
            detailed: "FOOD_AND_DRINK_COFFEE",
          },
        },
      ],
      modified: [],
      removed: [],
      accounts: [
        {
          account_id: "acct-a",
          name: "Checking",
          official_name: null,
          type: "depository",
          subtype: "checking",
          balances: {
            iso_currency_code: "USD",
            unofficial_currency_code: null,
            current: 100,
            available: 90,
            limit: null,
          },
        },
      ],
      next_cursor: `cursor-${randomUUID()}`,
      has_more: false,
      ...over,
    },
  };
}

async function historyComplete(ownerId: string, connectionId: string) {
  const list = await listOwnerConnections(url, { ownerId });
  if (!list.ok) {
    throw new Error(`listOwnerConnections failed: ${list.code}`);
  }
  return list.value.find((c) => c.connectionId === connectionId)
    ?.historyComplete;
}

describe.skipIf(!url)("drain sync history completion", () => {
  let ownerId: string;

  beforeAll(async () => {
    ensureTestKey();
    process.env.PLAID_CLIENT_ID = "drain-test-client";
    process.env.PLAID_SECRET = "drain-test-secret";
    process.env.PLAID_ENV = "sandbox";
    delete process.env.PLAID_WEBHOOK_URL;
    ownerId = await initOwner(url);
  });

  it("marks history_complete when a resumed drain reaches the end", async () => {
    const connectionId = await makeConnection(url, ownerId);

    // First run: commits the initial page, then the provider fails mid
    // drain. The claim releases and the committed cursor remains.
    transactionsSync
      .mockResolvedValueOnce(txnPage({ has_more: true }))
      .mockRejectedValue(new Error("provider down"));
    const first = await drainConnectionSync(url, { ownerId, connectionId });
    expect(first.ok).toBe(false);
    expect(await historyComplete(ownerId, connectionId)).toBe(false);

    // Second run: resumes from the committed cursor and finishes.
    transactionsSync.mockReset().mockResolvedValueOnce(txnPage());
    const second = await drainConnectionSync(url, { ownerId, connectionId });
    expect(second).toMatchObject({ ok: true });
    expect(await historyComplete(ownerId, connectionId)).toBe(true);
  });

  it("marks history_complete when a fresh drain completes", async () => {
    const connectionId = await makeConnection(url, ownerId);
    transactionsSync.mockReset().mockResolvedValueOnce(txnPage());
    const result = await drainConnectionSync(url, { ownerId, connectionId });
    expect(result).toMatchObject({ ok: true });
    expect(await historyComplete(ownerId, connectionId)).toBe(true);
  });
});
