import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runUnitOfWork = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/finance", () => {
  class OpFailure extends Error {
    code: string;
    successorId?: string;
    constructor(code: string, successorId?: string) {
      super(code);
      this.code = code;
      this.successorId = successorId;
    }
  }
  return { OpFailure, runUnitOfWork };
});

import { getMonthlySpending } from "./spending-service";

const OWNER = "11111111-1111-4111-8111-111111111111";
const DINING = "22222222-2222-4222-8222-222222222222";
const TRAVEL = "33333333-3333-4333-8333-333333333333";
const UNCAT = "44444444-4444-4444-8444-444444444444";
const URL = "postgresql://app@127.0.0.1:5432/ledger";

type Rows = Record<string, unknown>[];

// A canned ledger: each handler returns the rows for one query the
// service issues, matched on a stable fragment of its SQL.
function fakeDb(tables: { match: string; rows: Rows }[]) {
  return {
    query: vi.fn(async (sql: string) => {
      const hit = tables.find((table) => sql.includes(table.match));
      if (!hit) {
        throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
      }
      return { rows: hit.rows };
    }),
  };
}

function stubWork(db: unknown) {
  runUnitOfWork.mockImplementation(
    async (_url: string, work: (db: unknown) => Promise<unknown>) => {
      try {
        return { ok: true, value: await work(db) };
      } catch (error) {
        const failure = error as { code?: string; successorId?: string };
        return {
          ok: false,
          code: failure.code ?? "INTERNAL_FAILURE",
          retryable: false,
          ...(failure.successorId !== undefined
            ? { successorId: failure.successorId }
            : {}),
        };
      }
    },
  );
}

const baseTables = {
  owner: { match: "FROM ledger.owner", rows: [{ time_zone: "UTC" }] },
  posted: { match: "AS posted_count", rows: [] as Rows },
  pending: { match: "AS effective", rows: [] as Rows },
  exclusions: { match: "AS reason", rows: [] as Rows },
  budgets: { match: "FROM ledger.budget", rows: [] as Rows },
  coverage: {
    match: "FROM ledger.account",
    rows: [{ missing: "0", nonusd: "0" }],
  },
  connections: { match: "FROM ledger.connection", rows: [] as Rows },
  uncat: {
    match: "AND stable_key = $2",
    rows: [{ id: UNCAT }],
  },
};

function dbWith(over: Partial<typeof baseTables>) {
  return fakeDb(Object.values({ ...baseTables, ...over }));
}

beforeEach(() => {
  runUnitOfWork.mockReset();
});

// covers spec 0007 AC-4 and AC-5: the summary the table reconciles to,
// assembled from integer sums, exclusion buckets, and budget status.
describe("getMonthlySpending input", () => {
  it.each([
    ["a month that is not a calendar month", { month: "2031-13" }],
    ["an unknown key", { extra: true }],
    ["a non uuid owner", { ownerId: "me" }],
  ])("rejects %s without touching the database", async (_n, extra) => {
    const result = await getMonthlySpending(URL, { ownerId: OWNER, ...extra });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(runUnitOfWork).not.toHaveBeenCalled();
  });
});

describe("getMonthlySpending", () => {
  it("fails NOT_FOUND when the owner row is missing", async () => {
    stubWork(dbWith({ owner: { match: "FROM ledger.owner", rows: [] } }));
    const result = await getMonthlySpending(URL, {
      ownerId: OWNER,
      month: "2031-01",
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("sums posted rows per category and orders them by stable key", async () => {
    stubWork(
      dbWith({
        posted: {
          match: "AS posted_count",
          rows: [
            {
              category_id: TRAVEL,
              label: "Travel",
              stable_key: "travel",
              total: "900",
              posted_count: "1",
            },
            {
              category_id: DINING,
              label: "Dining",
              stable_key: "dining",
              total: "1200",
              posted_count: "2",
            },
          ],
        },
      }),
    );
    const result = await getMonthlySpending(URL, {
      ownerId: OWNER,
      month: "2031-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.postedTotalUnits).toBe("2100");
    expect(result.value.categories.map((c) => c.stableKey)).toEqual([
      "dining",
      "travel",
    ]);
    expect(result.value.categories[0]).toMatchObject({
      spentUnits: "1200",
      postedCount: 2,
      budget: null,
    });
    expect(result.value.coverage.historyCompleteness).toBe("unknown");
  });

  it("splits pending rows into outflow and refund buckets only", async () => {
    stubWork(
      dbWith({
        pending: {
          match: "AS effective",
          rows: [
            { effective: "spending", total: "700" },
            { effective: "refund", total: "-200" },
            { effective: "transfer", total: "999" },
          ],
        },
      }),
    );
    const result = await getMonthlySpending(URL, {
      ownerId: OWNER,
      month: "2031-01",
    });
    expect(result.ok && result.value).toMatchObject({
      pendingOutflowUnits: "700",
      pendingRefundUnits: "-200",
      postedTotalUnits: "0",
    });
  });

  it("fills every exclusion bucket and derives budget status from integer spend", async () => {
    stubWork(
      dbWith({
        exclusions: {
          match: "AS reason",
          rows: [
            { reason: "transfer", n: "2" },
            { reason: "foreign_currency", n: "1" },
            { reason: "removed", n: "3" },
          ],
        },
        posted: {
          match: "AS posted_count",
          rows: [
            {
              category_id: DINING,
              label: "Dining",
              stable_key: "dining",
              total: "500",
              posted_count: "5",
            },
            {
              category_id: TRAVEL,
              label: "Travel",
              stable_key: "travel",
              total: "800",
              posted_count: "1",
            },
          ],
        },
        budgets: {
          match: "FROM ledger.budget",
          rows: [
            {
              category_id: DINING,
              label: "Dining",
              stable_key: "dining",
              limit_units: "500",
            },
            {
              category_id: TRAVEL,
              label: "Travel",
              stable_key: "travel",
              limit_units: "700",
            },
            {
              category_id: UNCAT,
              label: "Uncategorized",
              stable_key: "uncategorized",
              limit_units: "100",
            },
          ],
        },
      }),
    );
    const result = await getMonthlySpending(URL, {
      ownerId: OWNER,
      month: "2031-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exclusions).toEqual({
      foreignCurrency: 1,
      unclassifiedInflow: 0,
      unclassifiedOutflow: 0,
      income: 0,
      transfer: 2,
      cardPayment: 0,
      removed: 3,
      superseded: 0,
    });
    const byStableKey = Object.fromEntries(
      result.value.categories.map((c) => [c.stableKey, c.budget?.status]),
    );
    expect(byStableKey).toEqual({
      dining: "at_limit",
      travel: "over",
      uncategorized: "under",
    });
    const uncat = result.value.categories.find(
      (c) => c.stableKey === "uncategorized",
    );
    expect(uncat).toMatchObject({ spentUnits: "0", postedCount: 0 });
  });

  it("reports history completeness from the connection rows", async () => {
    stubWork(
      dbWith({
        connections: {
          match: "FROM ledger.connection",
          rows: [
            {
              id: "c1",
              state: "active",
              last_successful_sync_at: new Date("2031-01-02T00:00:00Z"),
              history_complete: true,
            },
            {
              id: "c2",
              state: "active",
              last_successful_sync_at: null,
              history_complete: false,
            },
          ],
        },
      }),
    );
    const result = await getMonthlySpending(URL, {
      ownerId: OWNER,
      month: "2031-01",
    });
    expect(result.ok && result.value.coverage).toMatchObject({
      historyCompleteness: "partial",
      connections: [
        { connectionId: "c1", lastSuccessfulSyncAt: "2031-01-02T00:00:00.000Z" },
        { connectionId: "c2", lastSuccessfulSyncAt: null },
      ],
    });
  });

  it("defaults the month from the injected clock in the owner time zone", async () => {
    stubWork(dbWith({}));
    const result = await getMonthlySpending(
      URL,
      { ownerId: OWNER },
      () => new Date("2031-07-04T12:00:00Z"),
    );
    expect(result.ok && result.value.month).toBe("2031-07");
    expect(result.ok && result.value.timeZone).toBe("UTC");
  });
});
