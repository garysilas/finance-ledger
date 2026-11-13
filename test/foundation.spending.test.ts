// Beta regression suite for spec 0003 monthly reads: exact totals,
// calendar and zone boundaries, exclusions, and coverage (AC-2, AC-3,
// AC-7, AC-10). Runs against the isolated test database.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMonthlySpending } from "@/features/finance/spending-service";
import { setBudget } from "@/features/finance/budget-service";
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
} from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!url)("monthly spending regression", () => {
  let ownerId: string;
  let seq = 0;

  beforeAll(async () => {
    ensureTestKey();
    ownerId = await initOwner(url);
  });

  // Each test owns a unique month inside a random per-run year window so
  // singleton owner totals stay isolated across tests and reruns.
  // Windows are disjoint per file (3000, 5000, 7000 bases) so parallel
  // files and reruns can never share a month.
  const runYear = 5000 + Math.floor(Math.random() * 2000);
  const nextMonth = () => {
    seq += 1;
    const year = runYear + Math.floor(seq / 12);
    const month = `${year}-${String((seq % 12) + 1).padStart(2, "0")}`;
    return { month, date: `${month}-15` };
  };

  async function seed(
    upserts: Record<string, unknown>[],
    accounts: Record<string, unknown>[] = [acctObs("acct-a")],
  ) {
    const connectionId = await makeConnection(url, ownerId);
    const batch = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      accountObservations: accounts,
      transactionUpserts: upserts,
    });
    if (!batch.ok) {
      throw new Error(`seed batch failed: ${batch.code}`);
    }
    return connectionId;
  }

  it("includes only posted dates inside the requested month (AC-3)", async () => {
    // A fixed month outside every random window: the boundary rows on
    // either side must not leak into another test's month. Fixed months
    // accumulate across reruns, so assert the delta over the baseline.
    const month = "9500-06";
    const prev = "9500-05-31";
    const last = "9500-06-30";
    const next = "9500-07-01";
    const before = BigInt(
      (await monthlySpending(url, ownerId, month)).postedTotalUnits,
    );
    await seed([
      postedTxn("edge-prev", {
        providerDate: prev,
        postedDate: prev,
        amount: "1.00",
      }),
      postedTxn("edge-first", {
        providerDate: `${month}-01`,
        postedDate: `${month}-01`,
        amount: "2.00",
      }),
      postedTxn("edge-last", {
        providerDate: last,
        postedDate: last,
        amount: "4.00",
      }),
      postedTxn("edge-next", {
        providerDate: next,
        postedDate: next,
        amount: "8.00",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    expect(BigInt(result.postedTotalUnits) - before).toBe(600n);
  });

  it("reads the final month of year 9999 with an inclusive end date (AC-3)", async () => {
    const before = BigInt(
      (await monthlySpending(url, ownerId, "9999-12")).postedTotalUnits,
    );
    await seed([
      postedTxn("y9999-a", {
        providerDate: "9999-12-31",
        postedDate: "9999-12-31",
        amount: "1.00",
      }),
      postedTxn("y9999-b", {
        providerDate: "9999-12-01",
        postedDate: "9999-12-01",
        amount: "2.00",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, "9999-12");
    expect(BigInt(result.postedTotalUnits) - before).toBe(300n);
  });

  it("reads the first month of year 0001 (AC-3)", async () => {
    const before = BigInt(
      (await monthlySpending(url, ownerId, "0001-01")).postedTotalUnits,
    );
    await seed([
      postedTxn("y0001", {
        providerDate: "0001-01-01",
        postedDate: "0001-01-01",
        amount: "7.00",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, "0001-01");
    expect(BigInt(result.postedTotalUnits) - before).toBe(700n);
  });

  it("rejects invalid months and impossible dates (AC-3)", async () => {
    expect(
      await getMonthlySpending(url, { ownerId, month: "2031-13" }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const connectionId = await makeConnection(url, ownerId);
    const bad = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [
        postedTxn("bad-date", {
          providerDate: "2031-02-30",
          postedDate: "2031-02-30",
        }),
      ],
    });
    expect(bad).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("resolves an omitted month from the injected clock in the owner zone, including around daylight saving changes (AC-3)", async () => {
    const at = async (instant: string) => {
      const result = await getMonthlySpending(
        url,
        { ownerId },
        () => new Date(instant),
      );
      if (!result.ok) throw new Error(result.code);
      return result.value.month;
    };
    // 03:30 UTC on Nov 1 is still Oct 31 in New York (EDT, UTC-4).
    expect(await at("2026-11-01T03:30:00Z")).toBe("2026-10");
    // After the 06:00 UTC transition to EST it is Nov 1 local.
    expect(await at("2026-11-01T07:30:00Z")).toBe("2026-11");
    // 04:30 UTC on Mar 1 is still Feb 28 in New York (EST, UTC-5).
    expect(await at("2026-03-01T04:30:00Z")).toBe("2026-02");
    expect(await at("2026-03-01T05:30:00Z")).toBe("2026-03");
  });

  it("lets a refund reduce spending only in its own posted month (AC-3, AC-10)", async () => {
    const buy = nextMonth();
    const back = nextMonth();
    await seed([
      postedTxn("refund-buy", {
        providerDate: buy.date,
        postedDate: buy.date,
        amount: "10.00",
      }),
      postedTxn("refund-back", {
        providerDate: back.date,
        postedDate: back.date,
        amount: "-10.00",
        providerClassification: "refund",
      }),
    ]);
    expect(
      (await monthlySpending(url, ownerId, buy.month)).postedTotalUnits,
    ).toBe("1000");
    expect(
      (await monthlySpending(url, ownerId, back.month)).postedTotalUnits,
    ).toBe("-1000");
  });

  it("counts an uncategorized refund and an unknown outflow under Uncategorized (AC-4, AC-10)", async () => {
    const { month, date } = nextMonth();
    await seed([
      postedTxn("unc-out", {
        providerDate: date,
        postedDate: date,
        amount: "8.00",
      }),
      postedTxn("unc-ref", {
        providerDate: date,
        postedDate: date,
        amount: "-3.00",
        providerClassification: "refund",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    const unc = result.categories.find((c) => c.stableKey === "uncategorized");
    expect(unc?.spentUnits).toBe("500");
    expect(result.postedTotalUnits).toBe("500");
  });

  it("excludes foreign currency, transfers, card payments, and unclassified inflows with counts (AC-2, AC-10)", async () => {
    const { month, date } = nextMonth();
    await seed([
      postedTxn("usd", {
        providerDate: date,
        postedDate: date,
        amount: "5.00",
      }),
      postedTxn("eur", {
        providerDate: date,
        postedDate: date,
        amount: "5.00",
        currencyCode: "EUR",
      }),
      postedTxn("xfer", {
        providerDate: date,
        postedDate: date,
        amount: "50.00",
        providerClassification: "transfer",
      }),
      postedTxn("cardpay", {
        providerDate: date,
        postedDate: date,
        amount: "50.00",
        providerClassification: "card_payment",
      }),
      postedTxn("inflow", {
        providerDate: date,
        postedDate: date,
        amount: "-20.00",
        providerClassification: "unclassified",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    expect(result.postedTotalUnits).toBe("500");
    expect(result.exclusions.foreignCurrency).toBe(1);
    expect(result.exclusions.transfer).toBe(1);
    expect(result.exclusions.cardPayment).toBe(1);
    expect(result.exclusions.unclassifiedInflow).toBe(1);
  });

  it("keeps pending outflows and refunds in separate buckets that never enter posted totals (AC-5, AC-10)", async () => {
    const { month, date } = nextMonth();
    await seed([
      pendingTxn("pend-out", { providerDate: date, amount: "12.00" }),
      pendingTxn("pend-ref", {
        providerDate: date,
        amount: "-4.00",
        providerClassification: "refund",
      }),
      postedTxn("posted", {
        providerDate: date,
        postedDate: date,
        amount: "1.00",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    expect(result.postedTotalUnits).toBe("100");
    expect(result.pendingOutflowUnits).toBe("1200");
    expect(result.pendingRefundUnits).toBe("-400");
  });

  it("sums category totals back to the posted total (AC-10)", async () => {
    const { month, date } = nextMonth();
    await seed([
      postedTxn("cat-dining", {
        providerDate: date,
        postedDate: date,
        amount: "11.00",
        providerCategoryStableKey: "dining",
      }),
      postedTxn("cat-groc", {
        providerDate: date,
        postedDate: date,
        amount: "22.00",
        providerCategoryStableKey: "groceries",
      }),
      postedTxn("cat-none", {
        providerDate: date,
        postedDate: date,
        amount: "3.00",
      }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    const sum = result.categories.reduce(
      (total, c) => total + BigInt(c.spentUnits),
      0n,
    );
    expect(sum.toString()).toBe(result.postedTotalUnits);
    expect(result.postedTotalUnits).toBe("3600");
  });

  it("returns zero totals and no categories for an empty month (AC-10)", async () => {
    const { month } = nextMonth();
    const result = await monthlySpending(url, ownerId, month);
    expect(result.postedTotalUnits).toBe("0");
    expect(result.pendingOutflowUnits).toBe("0");
    expect(result.pendingRefundUnits).toBe("0");
    expect(result.categories).toEqual([]);
    expect(result.coverage.historyCompleteness).toBe("unknown");
  });

  it("sums beyond a single bigint through exact numeric totals (AC-2)", async () => {
    const { month, date } = nextMonth();
    const max = "92233720368547758.07";
    await seed([
      postedTxn("big-a", { providerDate: date, postedDate: date, amount: max }),
      postedTxn("big-b", { providerDate: date, postedDate: date, amount: max }),
    ]);
    const result = await monthlySpending(url, ownerId, month);
    expect(result.postedTotalUnits).toBe("18446744073709551614");
  });

  it("counts missing and non USD balances without inventing zeros (AC-10)", async () => {
    const { month } = nextMonth();
    const before = await monthlySpending(url, ownerId, month);
    await seed(
      [],
      [
        acctObs(`acct-usd-${seq}`),
        acctObs(`acct-none-${seq}`, {
          currencyCode: null,
          current: null,
          available: null,
          creditLimit: null,
          balanceObservedAt: null,
        }),
        acctObs(`acct-eur-${seq}`, {
          currencyCode: "EUR",
          current: "250.00",
          available: null,
        }),
      ],
    );
    const after = await monthlySpending(url, ownerId, month);
    // acct-usd counts in neither bucket. The currency free account adds
    // one missing balance and one non USD balance; the EUR account adds
    // one more non USD balance.
    expect(
      after.coverage.missingBalances - before.coverage.missingBalances,
    ).toBe(1);
    expect(after.coverage.nonUsdBalances - before.coverage.nonUsdBalances).toBe(
      2,
    );
  });

  it("keeps zero, absent, and exceeded budgets distinct (AC-7, AC-10)", async () => {
    const { month, date } = nextMonth();
    const diningId = await categoryId(url, ownerId, "dining");
    const groceriesId = await categoryId(url, ownerId, "groceries");

    await setBudget(url, {
      ownerId,
      categoryId: diningId,
      month,
      limit: "0.00",
      expectedRevision: "create",
      requestId: randomUUID(),
    });
    await setBudget(url, {
      ownerId,
      categoryId: groceriesId,
      month,
      limit: "10.00",
      expectedRevision: "create",
      requestId: randomUUID(),
    });

    await seed([
      postedTxn("budget-dining", {
        providerDate: date,
        postedDate: date,
        amount: "5.00",
        providerCategoryStableKey: "dining",
      }),
      postedTxn("budget-groc", {
        providerDate: date,
        postedDate: date,
        amount: "12.00",
        providerCategoryStableKey: "groceries",
      }),
      postedTxn("budget-other", {
        providerDate: date,
        postedDate: date,
        amount: "7.00",
        providerCategoryStableKey: "other",
      }),
    ]);

    const result = await monthlySpending(url, ownerId, month);
    const dining = result.categories.find((c) => c.stableKey === "dining");
    const groceries = result.categories.find(
      (c) => c.stableKey === "groceries",
    );
    const other = result.categories.find((c) => c.stableKey === "other");
    // A zero budget is present and immediately exceeded by any spend.
    expect(dining?.budget).toEqual({
      limitUnits: "0",
      remainingUnits: "-500",
      status: "over",
    });
    expect(groceries?.budget).toEqual({
      limitUnits: "1000",
      remainingUnits: "-200",
      status: "over",
    });
    // No budget stays null, never confused with a zero limit.
    expect(other?.budget).toBeNull();
  });
});
