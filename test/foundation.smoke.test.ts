// Temporary thin-thread verification for /develop task 1. Exercises the
// real services against the dev database. Deleted once the Beta test
// suite exists; do not extend.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { initializeOwner } from "@/features/finance/owner-service";
import {
  createConnection,
  decryptConnectionToken,
  setConnectionState,
} from "@/features/finance/connection-service";
import { applyProviderBatch } from "@/features/finance/batch-service";
import { getMonthlySpending } from "@/features/finance/spending-service";

const url = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!url)("financial foundation thin thread", () => {
  it("migrates, stores, and reads a month", async () => {
    const ownerId = randomUUID();
    const init = await initializeOwner(url, {
      ownerId,
      requestId: randomUUID(),
    });
    if (!init.ok) console.log("init failure", init);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    const realOwner = init.value.value?.ownerId ?? ownerId;

    const conn = await createConnection(url, {
      ownerId: realOwner,
      provider: "plaid",
      environment: "sandbox",
      providerItemId: "item-smoke-1",
      institutionId: "ins_1",
      institutionName: "Smoke Bank",
      tokenPlaintext: "access-sandbox-fake-token",
      requestId: randomUUID(),
    });
    expect(conn.ok).toBe(true);
    if (!conn.ok) return;
    const connectionId = conn.value.value!.connectionId;

    const token = await decryptConnectionToken(url, {
      ownerId: realOwner,
      connectionId,
    });
    expect(token).toEqual({ ok: true, value: "access-sandbox-fake-token" });

    const batchRequestId = randomUUID();
    const batch = await applyProviderBatch(url, {
      ownerId: realOwner,
      connectionId,
      expectedCursor: null,
      nextCursor: "cursor-1",
      accountObservations: [
        {
          providerAccountId: "acct-1",
          name: "Checking",
          officialName: null,
          type: "depository",
          subtype: "checking",
          currencyCode: "USD",
          current: "1000.00",
          available: "950.00",
          creditLimit: null,
          balanceObservedAt: "2026-11-01T00:00:00Z",
        },
      ],
      transactionUpserts: [
        {
          providerTransactionId: "txn-1",
          providerAccountId: "acct-1",
          amount: "12.34",
          currencyCode: "USD",
          postingState: "posted",
          providerDate: "2026-11-03",
          postedDate: "2026-11-03",
          authorizedDate: null,
          providerPendingTransactionId: null,
          description: "Coffee",
          merchantName: "Cafe",
          providerCategoryCode: "FOOD",
          providerCategoryStableKey: "dining",
          providerClassification: "spending",
        },
        {
          providerTransactionId: "txn-pending",
          providerAccountId: "acct-1",
          amount: "5.00",
          currencyCode: "USD",
          postingState: "pending",
          providerDate: "2026-11-04",
          postedDate: null,
          authorizedDate: null,
          providerPendingTransactionId: null,
          description: "Pending snack",
          merchantName: null,
          providerCategoryCode: null,
          providerCategoryStableKey: null,
          providerClassification: "spending",
        },
      ],
      removalIds: [],
      requestId: batchRequestId,
    });
    expect(batch.ok).toBe(true);

    const spending = await getMonthlySpending(
      url,
      { ownerId: realOwner, month: "2026-11" },
      () => new Date("2026-11-12T12:00:00Z"),
    );
    expect(spending.ok).toBe(true);
    if (!spending.ok) return;
    expect(spending.value.postedTotalUnits).toBe("1234");
    expect(spending.value.pendingOutflowUnits).toBe("500");
    const dining = spending.value.categories.find(
      (c) => c.stableKey === "dining",
    );
    expect(dining?.spentUnits).toBe("1234");
    expect(spending.value.coverage.historyCompleteness).toBe("unknown");

    // receipt replay: identical batch returns already applied
    const replay = await applyProviderBatch(url, {
      ownerId: realOwner,
      connectionId,
      expectedCursor: null,
      nextCursor: "cursor-1",
      accountObservations: [
        {
          providerAccountId: "acct-1",
          name: "Checking",
          officialName: null,
          type: "depository",
          subtype: "checking",
          currencyCode: "USD",
          current: "1000.00",
          available: "950.00",
          creditLimit: null,
          balanceObservedAt: "2026-11-01T00:00:00Z",
        },
      ],
      transactionUpserts: [
        {
          providerTransactionId: "txn-1",
          providerAccountId: "acct-1",
          amount: "12.34",
          currencyCode: "USD",
          postingState: "posted",
          providerDate: "2026-11-03",
          postedDate: "2026-11-03",
          authorizedDate: null,
          providerPendingTransactionId: null,
          description: "Coffee",
          merchantName: "Cafe",
          providerCategoryCode: "FOOD",
          providerCategoryStableKey: "dining",
          providerClassification: "spending",
        },
        {
          providerTransactionId: "txn-pending",
          providerAccountId: "acct-1",
          amount: "5.00",
          currencyCode: "USD",
          postingState: "pending",
          providerDate: "2026-11-04",
          postedDate: null,
          authorizedDate: null,
          providerPendingTransactionId: null,
          description: "Pending snack",
          merchantName: null,
          providerCategoryCode: null,
          providerCategoryStableKey: null,
          providerClassification: "spending",
        },
      ],
      removalIds: [],
      requestId: batchRequestId,
    });
    expect(replay.ok && replay.value.alreadyApplied).toBe(true);
    if (replay.ok) {
      expect(replay.value.committedCursor).toBe("cursor-1");
    }

    // local disconnect clears the envelope but keeps history
    const state = await setConnectionState(url, {
      ownerId: realOwner,
      connectionId,
      expectedRevision: "2",
      targetState: "disconnected",
      requestId: randomUUID(),
    });
    expect(state.ok).toBe(true);

    const after = await getMonthlySpending(url, {
      ownerId: realOwner,
      month: "2026-11",
    });
    expect(after.ok && after.value.postedTotalUnits).toBe("1234");
  });
});
