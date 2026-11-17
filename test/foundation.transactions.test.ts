// Regression suite for spec 0007 transaction reads and edits: month
// scoping, default and excluded sets, filters and search, keyset paging,
// reconciliation with the month summary, and the edit guards (AC-1 to
// AC-7, AC-10). Runs against the isolated test database.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { setTransactionOverrides } from "@/features/finance/override-service";
import {
  getTransaction,
  listMonthTransactions,
} from "@/features/finance/transaction-service";
import type { TransactionRow } from "@/features/finance/transaction-params";
import {
  acctObs,
  applyBatch,
  categoryId,
  ensureTestKey,
  initOwner,
  makeConnection,
  monthlySpending,
  pendingTxn,
  postedTxn,
  q,
  txnRow,
} from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!url)("transaction table regression", () => {
  let ownerId: string;
  let seq = 0;

  beforeAll(async () => {
    ensureTestKey();
    ownerId = await initOwner(url);
  });

  // Disjoint from the other suites' year windows (3000, 5000, 7000
  // bases, the fixed 9500 and 9999 months, and the 2024 perf range).
  const runYear = 1100 + Math.floor(Math.random() * 800);
  const nextMonth = () => {
    seq += 1;
    const year = runYear + Math.floor(seq / 12);
    const month = `${year}-${String((seq % 12) + 1).padStart(2, "0")}`;
    return {
      month,
      date: (day: number) => `${month}-${String(day).padStart(2, "0")}`,
    };
  };

  async function seed(upserts: Record<string, unknown>[]) {
    const connectionId = await makeConnection(url, ownerId);
    const batch = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      accountObservations: [acctObs("acct-a")],
      transactionUpserts: upserts,
    });
    if (!batch.ok) {
      throw new Error(`seed batch failed: ${batch.code}`);
    }
    return connectionId;
  }

  async function list(month: string, over: Record<string, unknown> = {}) {
    const result = await listMonthTransactions(url, {
      ownerId,
      month,
      showExcluded: false,
      ...over,
    });
    if (!result.ok) {
      throw new Error(`listMonthTransactions failed: ${result.code}`);
    }
    return result.value;
  }

  async function listAll(month: string, over: Record<string, unknown> = {}) {
    const rows: TransactionRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await list(month, {
        ...over,
        ...(cursor ? { cursor } : {}),
      });
      rows.push(...page.rows);
      if (page.nextCursor === null) return { rows, first: page };
      cursor = page.nextCursor;
    }
  }

  const posted = (
    id: string,
    date: string,
    over: Record<string, unknown> = {},
  ) => postedTxn(id, { providerDate: date, postedDate: date, ...over });

  it("lists counting rows newest first with the default set and reconciles to the posted total (AC-1, AC-2, AC-4)", async () => {
    const { month, date } = nextMonth();
    await seed([
      posted(`a${seq}`, date(3), {
        amount: "10.00",
        providerCategoryStableKey: "dining",
      }),
      posted(`b${seq}`, date(20), {
        amount: "-4.00",
        providerClassification: "refund",
      }),
      pendingTxn(`c${seq}`, { providerDate: date(25), amount: "7.00" }),
      posted(`x${seq}`, date(10), {
        amount: "50.00",
        providerClassification: "transfer",
      }),
      posted(`e${seq}`, date(11), { amount: "5.00", currencyCode: "EUR" }),
    ]);

    const page = await list(month);
    expect(page.rows.map((row) => row.date)).toEqual([
      date(25),
      date(20),
      date(3),
    ]);
    expect(page.rows.every((row) => row.exclusionReason === null)).toBe(true);
    expect(page.rows[0]).toMatchObject({
      postingState: "pending",
      editable: true,
      edited: false,
    });
    expect(page.matchCount).toBe(3);

    const summary = await monthlySpending(url, ownerId, month);
    expect(page.filteredPostedUnits).toBe(summary.postedTotalUnits);
    expect(page.filteredPostedUnits).toBe("600");
  });

  it("shows excluded rows with one precedence ordered reason that matches the summary buckets (AC-2)", async () => {
    const { month, date } = nextMonth();
    const connectionId = await seed([
      posted(`usd${seq}`, date(1), { amount: "5.00" }),
      posted(`xfer${seq}`, date(2), {
        amount: "50.00",
        providerClassification: "transfer",
      }),
      posted(`card${seq}`, date(3), {
        amount: "20.00",
        providerClassification: "card_payment",
      }),
      posted(`inc${seq}`, date(4), {
        amount: "-900.00",
        providerClassification: "income",
      }),
      posted(`in${seq}`, date(5), {
        amount: "-3.00",
        providerClassification: "unclassified",
      }),
      posted(`out${seq}`, date(6), {
        amount: "3.00",
        providerClassification: "unclassified",
      }),
      posted(`eur${seq}`, date(7), {
        amount: "8.00",
        currencyCode: "EUR",
        providerClassification: "transfer",
      }),
      posted(`gone${seq}`, date(8), {
        amount: "9.00",
        providerClassification: "transfer",
      }),
    ]);
    const removed = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor:
        (
          await q<{ cursor: string }>(
            url,
            "SELECT sync_cursor AS cursor FROM ledger.connection WHERE id = $1",
            [connectionId],
          )
        )[0]?.cursor ?? null,
      accountObservations: [],
      removalIds: [`gone${seq}`],
    });
    expect(removed.ok).toBe(true);

    const { rows, first } = await listAll(month, { showExcluded: true });
    const reasons = Object.fromEntries(
      rows.map((row) => [row.description.split(" ")[1], row.exclusionReason]),
    );
    expect(reasons).toEqual({
      [`usd${seq}`]: null,
      [`xfer${seq}`]: "transfer",
      [`card${seq}`]: "card_payment",
      [`inc${seq}`]: "income",
      [`in${seq}`]: "unclassified_inflow",
      [`out${seq}`]: "unclassified_outflow",
      [`eur${seq}`]: "foreign_currency",
      [`gone${seq}`]: "removed",
    });
    expect(
      rows.find((row) => row.exclusionReason === "removed")?.editable,
    ).toBe(false);
    expect(first.matchCount).toBe(8);
    expect(first.filteredPostedUnits).toBe("500");

    const summary = await monthlySpending(url, ownerId, month);
    expect(summary.exclusions).toMatchObject({
      transfer: 1,
      cardPayment: 1,
      income: 1,
      unclassifiedInflow: 1,
      unclassifiedOutflow: 1,
      foreignCurrency: 1,
      removed: 1,
      superseded: 0,
    });
    const excludedTotal = Object.values(summary.exclusions).reduce(
      (a, b) => a + b,
      0,
    );
    expect(excludedTotal).toBe(
      rows.filter((row) => row.exclusionReason !== null).length,
    );
  });

  it("filters by category, Uncategorized sentinel, account, and escaped search within the month (AC-3, AC-4)", async () => {
    const { month, date } = nextMonth();
    await seed([
      posted(`d1-${seq}`, date(1), {
        amount: "12.00",
        providerCategoryStableKey: "dining",
        merchantName: "Cafe 100%",
      }),
      posted(`d2-${seq}`, date(2), {
        amount: "8.00",
        providerCategoryStableKey: "dining",
        description: "Bistro_Row",
      }),
      posted(`g1-${seq}`, date(3), {
        amount: "30.00",
        providerCategoryStableKey: "groceries",
      }),
      posted(`u1-${seq}`, date(4), { amount: "2.00" }),
    ]);
    const otherConnection = await seed([
      posted(`o1-${seq}`, date(5), {
        amount: "1.00",
        providerCategoryStableKey: "dining",
      }),
    ]);
    const diningId = await categoryId(url, ownerId, "dining");

    const dining = await listAll(month, { categoryId: diningId });
    expect(dining.rows).toHaveLength(3);
    expect(dining.first.filteredPostedUnits).toBe("2100");

    const uncategorized = await listAll(month, { categoryId: "uncategorized" });
    expect(uncategorized.rows.map((row) => row.categoryLabel)).toEqual([
      "Uncategorized",
    ]);

    const [{ account_id: accountId }] = await q<{ account_id: string }>(
      url,
      "SELECT account_id FROM ledger.transaction WHERE connection_id = $1",
      [otherConnection],
    );
    const byAccount = await list(month, { accountId });
    expect(byAccount.rows).toHaveLength(1);
    expect(byAccount.matchCount).toBe(1);

    // % and _ match literally, not as wildcards.
    expect((await list(month, { query: "100%" })).rows).toHaveLength(1);
    expect((await list(month, { query: "o_R" })).rows).toHaveLength(1);
    expect((await list(month, { query: "_" })).rows).toHaveLength(1);
    expect((await list(month, { query: "   " })).matchCount).toBe(5);

    expect(
      await listMonthTransactions(url, {
        ownerId,
        month,
        showExcluded: false,
        categoryId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await listMonthTransactions(url, {
        ownerId,
        month,
        showExcluded: false,
        accountId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await listMonthTransactions(url, { ownerId, month, showExcluded: "yes" }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("pages by keyset 50 rows at a time with no gaps or repeats on tied dates (AC-1)", async () => {
    const { month, date } = nextMonth();
    await seed(
      Array.from({ length: 120 }, (_, i) =>
        posted(`page${seq}-${i}`, date((i % 3) + 1), { amount: "1.00" }),
      ),
    );
    const first = await list(month);
    expect(first.rows).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const { rows } = await listAll(month);
    expect(rows).toHaveLength(120);
    expect(new Set(rows.map((row) => row.id)).size).toBe(120);
    const keys = rows.map((row) => `${row.date}_${row.id}`);
    expect([...keys].sort().reverse()).toEqual(keys);
  });

  it("matches every breakdown posted count with its drilled row count (AC-5)", async () => {
    const { month, date } = nextMonth();
    await seed([
      posted(`k1-${seq}`, date(1), {
        amount: "3.00",
        providerCategoryStableKey: "travel",
      }),
      posted(`k2-${seq}`, date(2), {
        amount: "4.00",
        providerCategoryStableKey: "travel",
      }),
      posted(`k3-${seq}`, date(3), {
        amount: "5.00",
        providerCategoryStableKey: "health",
      }),
      posted(`k4-${seq}`, date(4), { amount: "6.00" }),
    ]);
    const summary = await monthlySpending(url, ownerId, month);
    for (const category of summary.categories) {
      const drilled = await listAll(month, {
        categoryId:
          category.stableKey === "uncategorized"
            ? "uncategorized"
            : category.categoryId,
      });
      expect(
        drilled.rows.filter((row) => row.postingState === "posted"),
      ).toHaveLength(category.postedCount);
      expect(drilled.first.filteredPostedUnits).toBe(category.spentUnits);
    }
  });

  it("keeps an edit on a pending row through its posted replacement (AC-6)", async () => {
    const { month, date } = nextMonth();
    const connectionId = await seed([
      pendingTxn(`p-${seq}`, { providerDate: date(9), amount: "15.00" }),
    ]);
    const pending = (await list(month)).rows[0];
    const travelId = await categoryId(url, ownerId, "travel");
    const edited = await setTransactionOverrides(url, {
      ownerId,
      transactionId: pending.id,
      expectedOwnerEditRevision: pending.ownerEditRevision,
      categoryId: travelId,
      requestId: randomUUID(),
    });
    expect(edited.ok).toBe(true);

    const cursor = (
      await q<{ cursor: string }>(
        url,
        "SELECT sync_cursor AS cursor FROM ledger.connection WHERE id = $1",
        [connectionId],
      )
    )[0].cursor;
    const replaced = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: cursor,
      accountObservations: [],
      transactionUpserts: [
        posted(`s-${seq}`, date(10), {
          amount: "15.00",
          providerPendingTransactionId: `p-${seq}`,
        }),
      ],
    });
    expect(replaced.ok).toBe(true);

    const rows = (await list(month)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      postingState: "posted",
      categoryId: travelId,
      edited: true,
    });

    // The stale pending edit is now a conflict that names the successor.
    const stale = await setTransactionOverrides(url, {
      ownerId,
      transactionId: pending.id,
      expectedOwnerEditRevision: "1",
      classification: "transfer",
      requestId: randomUUID(),
    });
    expect(stale).toMatchObject({
      ok: false,
      code: "CONFLICT",
      successorId: rows[0].id,
    });
    const superseded = await getTransaction(url, {
      ownerId,
      transactionId: pending.id,
    });
    expect(superseded.ok && superseded.value).toMatchObject({
      exclusionReason: "superseded",
      editable: false,
    });
  });

  it("returns CONFLICT for a stale revision and succeeds on the fresh one (AC-7)", async () => {
    const { month, date } = nextMonth();
    await seed([posted(`r-${seq}`, date(2), { amount: "9.00" })]);
    const row = (await list(month)).rows[0];
    const first = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: row.ownerEditRevision,
      classification: "transfer",
      requestId: randomUUID(),
    });
    expect(first.ok).toBe(true);

    const stale = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: row.ownerEditRevision,
      classification: "spending",
      requestId: randomUUID(),
    });
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" });

    const fresh = await getTransaction(url, { ownerId, transactionId: row.id });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.value).toMatchObject({
      classification: "transfer",
      exclusionReason: "transfer",
      edited: true,
    });
    const retry = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: fresh.value.ownerEditRevision,
      classification: "spending",
      requestId: randomUUID(),
    });
    expect(retry.ok).toBe(true);
    expect((await list(month)).rows[0].classification).toBe("spending");
  });

  it("rejects edits to removed rows inside the service without change (AC-2, AC-7)", async () => {
    const { month, date } = nextMonth();
    const connectionId = await seed([
      posted(`rm-${seq}`, date(4), { amount: "6.00" }),
    ]);
    const cursor = (
      await q<{ cursor: string }>(
        url,
        "SELECT sync_cursor AS cursor FROM ledger.connection WHERE id = $1",
        [connectionId],
      )
    )[0].cursor;
    expect(
      (
        await applyBatch(url, {
          ownerId,
          connectionId,
          expectedCursor: cursor,
          accountObservations: [],
          removalIds: [`rm-${seq}`],
        })
      ).ok,
    ).toBe(true);
    const row = (await list(month, { showExcluded: true })).rows[0];
    expect(row).toMatchObject({ exclusionReason: "removed", editable: false });

    const attempt = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: row.ownerEditRevision,
      classification: "transfer",
      requestId: randomUUID(),
    });
    expect(attempt).toMatchObject({ ok: false, code: "CONFLICT" });
    const after = await txnRow(url, connectionId, `rm-${seq}`);
    expect(after.owner_classification).toBeNull();
    expect(after.owner_edit_revision).toBe("0");
  });

  it("scopes single row reads to the owner (AC-10)", async () => {
    const { month, date } = nextMonth();
    await seed([posted(`own-${seq}`, date(1))]);
    const row = (await list(month)).rows[0];
    expect(
      await getTransaction(url, {
        ownerId: randomUUID(),
        transactionId: row.id,
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await getTransaction(url, { ownerId, transactionId: "not-a-uuid" }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});
