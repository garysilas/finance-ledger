import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validateEnv = vi.hoisted(() => vi.fn());
const requireSessionMock = vi.hoisted(() => vi.fn());
const plaidCreateLinkToken = vi.hoisted(() => vi.fn());
const plaidExchangePublicToken = vi.hoisted(() => vi.fn());
const plaidLookupInstitution = vi.hoisted(() => vi.fn());
const drainConnectionSync = vi.hoisted(() => vi.fn());
const createConnectionMock = vi.hoisted(() => vi.fn());
const findConnectionByProviderItem = vi.hoisted(() => vi.fn());

vi.mock("@/server/env", () => ({ validateEnv }));
vi.mock("@/server/session", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("@/server/plaid", () => ({
  plaidCreateLinkToken,
  plaidExchangePublicToken,
  plaidLookupInstitution,
  drainConnectionSync,
}));
vi.mock("@/features/finance/connection-service", () => ({
  createConnection: createConnectionMock,
  findConnectionByProviderItem,
}));
vi.mock("@/features/finance/service", async () => {
  const { z } = await import("zod");
  return { uuid: z.string().uuid() };
});
const listMonthTransactions = vi.hoisted(() => vi.fn());
const getTransaction = vi.hoisted(() => vi.fn());
const setTransactionOverrides = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/features/finance/transaction-service", () => ({
  listMonthTransactions,
  getTransaction,
}));
vi.mock("@/features/finance/override-service", () => ({
  setTransactionOverrides,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  completeConnectionAction,
  createLinkTokenAction,
  fetchTransactionPage,
  retryInitialSyncAction,
  updateTransaction,
} from "./actions";

const DB_URL = "postgresql://app@127.0.0.1:5432/ledger";
const SESSION = {
  sessionId: "session-1",
  ownerId: "11111111-1111-4111-8111-111111111111",
  timeZone: "America/New_York",
};
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";

function fail(code: string) {
  return { ok: false as const, code, retryable: false };
}

beforeEach(() => {
  validateEnv.mockReset().mockReturnValue({
    ok: true,
    config: { databaseUrl: DB_URL },
  });
  requireSessionMock.mockReset().mockResolvedValue(SESSION);
  plaidCreateLinkToken.mockReset();
  plaidExchangePublicToken.mockReset();
  plaidLookupInstitution.mockReset();
  drainConnectionSync.mockReset();
  createConnectionMock.mockReset();
  findConnectionByProviderItem.mockReset();
  listMonthTransactions.mockReset();
  getTransaction.mockReset();
  setTransactionOverrides.mockReset();
  revalidatePath.mockReset();
});

// covers: AC-2 every action revalidates the session itself; AC-3 the
// connect flow; AC-7 no token material in results; AC-8 stage failures
// keep committed work resumable.
describe("session enforcement", () => {
  it.each([
    ["createLinkTokenAction", () => createLinkTokenAction()],
    ["completeConnectionAction", () => completeConnectionAction("tok")],
    ["retryInitialSyncAction", () => retryInitialSyncAction(CONNECTION_ID)],
    [
      "fetchTransactionPage",
      () => fetchTransactionPage({ month: "2031-01", showExcluded: false }),
    ],
    [
      "updateTransaction",
      () =>
        updateTransaction({
          transactionId: CONNECTION_ID,
          expectedOwnerEditRevision: "0",
          classification: "transfer",
          requestId: CONNECTION_ID,
        }),
    ],
  ])(
    "%s fails with SESSION when there is no live session",
    async (_n, call) => {
      requireSessionMock.mockResolvedValue(null);
      const result = await call();
      expect(result).toMatchObject({ ok: false, code: "SESSION" });
    },
  );

  it.each([
    ["createLinkTokenAction", () => createLinkTokenAction()],
    ["completeConnectionAction", () => completeConnectionAction("tok")],
    ["retryInitialSyncAction", () => retryInitialSyncAction(CONNECTION_ID)],
  ])("%s fails closed when settings are invalid", async (_n, call) => {
    validateEnv.mockReturnValue({ ok: false, code: "CONFIG_INVALID" });
    const result = await call();
    expect(result).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
    expect(requireSessionMock).not.toHaveBeenCalled();
  });
});

describe("createLinkTokenAction", () => {
  it("returns the link token for the session owner", async () => {
    plaidCreateLinkToken.mockResolvedValue({ ok: true, value: "link-tok" });
    const result = await createLinkTokenAction();
    expect(result).toEqual({ ok: true, linkToken: "link-tok" });
    expect(plaidCreateLinkToken).toHaveBeenCalledWith(SESSION.ownerId);
  });

  it("passes through a provider failure as a fixed code", async () => {
    plaidCreateLinkToken.mockResolvedValue(fail("PROVIDER_UNAVAILABLE"));
    const result = await createLinkTokenAction();
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("completeConnectionAction", () => {
  function happyPath() {
    plaidExchangePublicToken.mockResolvedValue({
      ok: true,
      value: { accessToken: "access-secret", itemId: "item-1" },
    });
    plaidLookupInstitution.mockResolvedValue({
      ok: true,
      value: { institutionId: "ins_1", institutionName: "Test Bank" },
    });
    createConnectionMock.mockResolvedValue({
      ok: true,
      value: { value: { connectionId: CONNECTION_ID, state: "active" } },
    });
    drainConnectionSync.mockResolvedValue({
      ok: true,
      value: {
        connectionId: CONNECTION_ID,
        cursor: "cursor-2",
        counts: { inserted: 3, updated: 0, removed: 0 },
      },
    });
  }

  it.each([
    ["an empty token", ""],
    ["an overlong token", "x".repeat(1025)],
  ])(
    "rejects %s at the exchange stage without calling Plaid",
    async (_label, token) => {
      const result = await completeConnectionAction(token);
      expect(result).toEqual({
        ok: false,
        stage: "exchange",
        code: "INVALID_INPUT",
      });
      expect(plaidExchangePublicToken).not.toHaveBeenCalled();
    },
  );

  it("runs exchange, institution, connection, and one sync page in order", async () => {
    happyPath();
    const result = await completeConnectionAction("public-token");
    expect(result).toEqual({ ok: true, connectionId: CONNECTION_ID });
    expect(plaidExchangePublicToken).toHaveBeenCalledWith("public-token");
    expect(plaidLookupInstitution).toHaveBeenCalledWith("access-secret");
    expect(createConnectionMock).toHaveBeenCalledWith(
      DB_URL,
      expect.objectContaining({
        ownerId: SESSION.ownerId,
        providerItemId: "item-1",
        institutionName: "Test Bank",
        tokenPlaintext: "access-secret",
      }),
    );
    expect(drainConnectionSync).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      connectionId: CONNECTION_ID,
    });
  });

  it("never returns the access token in any outcome", async () => {
    happyPath();
    const ok = await completeConnectionAction("public-token");
    expect(JSON.stringify(ok)).not.toContain("access-secret");

    drainConnectionSync.mockResolvedValue(fail("PROVIDER_UNAVAILABLE"));
    const bad = await completeConnectionAction("public-token");
    expect(JSON.stringify(bad)).not.toContain("access-secret");
  });

  it.each([
    ["exchange", plaidExchangePublicToken, "INVALID_INPUT"],
    ["institution", plaidLookupInstitution, "PROVIDER_UNAVAILABLE"],
    ["connection", createConnectionMock, "INTERNAL_FAILURE"],
    ["sync", drainConnectionSync, "PROVIDER_UNAVAILABLE"],
  ])("reports a %s stage failure with its code", async (stage, mock, code) => {
    happyPath();
    mock.mockResolvedValue(fail(code));
    const result = await completeConnectionAction("public-token");
    expect(result).toMatchObject({ ok: false, stage, code });
  });

  it("reconciles a duplicate provider item to the existing connection", async () => {
    happyPath();
    createConnectionMock.mockResolvedValue(fail("CONFLICT"));
    findConnectionByProviderItem.mockResolvedValue({
      ok: true,
      value: { connectionId: CONNECTION_ID, state: "active" },
    });
    const result = await completeConnectionAction("public-token");
    expect(result).toEqual({ ok: true, connectionId: CONNECTION_ID });
    expect(findConnectionByProviderItem).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      providerItemId: "item-1",
    });
  });

  it("reports CONFLICT when the provider item cannot be reconciled", async () => {
    happyPath();
    createConnectionMock.mockResolvedValue(fail("CONFLICT"));
    findConnectionByProviderItem.mockResolvedValue({
      ok: true,
      value: null,
    });
    const result = await completeConnectionAction("public-token");
    expect(result).toEqual({
      ok: false,
      stage: "connection",
      code: "CONFLICT",
    });
    expect(drainConnectionSync).not.toHaveBeenCalled();
  });

  it("carries the connection id on a sync failure so retry resumes", async () => {
    happyPath();
    drainConnectionSync.mockResolvedValue(fail("CONFLICT"));
    const result = await completeConnectionAction("public-token");
    expect(result).toEqual({
      ok: false,
      stage: "sync",
      code: "CONFLICT",
      connectionId: CONNECTION_ID,
    });
  });
});

describe("retryInitialSyncAction", () => {
  it("rejects a malformed connection id", async () => {
    const result = await retryInitialSyncAction("not-a-uuid");
    expect(result).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(drainConnectionSync).not.toHaveBeenCalled();
  });

  it("imports one page for the session owner", async () => {
    drainConnectionSync.mockResolvedValue({
      ok: true,
      value: { connectionId: CONNECTION_ID, cursor: "c", counts: {} },
    });
    const result = await retryInitialSyncAction(CONNECTION_ID);
    expect(result).toEqual({ ok: true });
    expect(drainConnectionSync).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      connectionId: CONNECTION_ID,
    });
  });

  it("passes through the sync failure code", async () => {
    drainConnectionSync.mockResolvedValue(fail("NOT_FOUND"));
    const result = await retryInitialSyncAction(CONNECTION_ID);
    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

// covers spec 0007: AC-1 load more paging; AC-6 edits through the
// override service; AC-7 conflict refetch and revalidation; AC-10 session
// owner only, strict input, fixed codes.
describe("fetchTransactionPage", () => {
  const PAGE = {
    rows: [],
    nextCursor: null,
    matchCount: 0,
    filteredPostedUnits: "0",
  };

  it("reads with the session owner, never a caller supplied one", async () => {
    listMonthTransactions.mockResolvedValue({ ok: true, value: PAGE });
    const input = {
      month: "2031-01",
      categoryId: "uncategorized",
      query: "cafe",
      showExcluded: true,
      cursor: `2031-01-05_${CONNECTION_ID}`,
    };
    expect(await fetchTransactionPage(input)).toEqual({ ok: true, page: PAGE });
    expect(listMonthTransactions).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      ...input,
    });
  });

  it.each([
    ["an owner id", { ownerId: SESSION.ownerId }],
    ["a malformed cursor", { cursor: "page-2" }],
    ["an over long search", { query: "x".repeat(121) }],
    ["a bad category", { categoryId: "dining" }],
  ])("rejects %s with INVALID_INPUT", async (_name, extra) => {
    const result = await fetchTransactionPage({
      month: "2031-01",
      showExcluded: false,
      ...extra,
    });
    expect(result).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(listMonthTransactions).not.toHaveBeenCalled();
  });

  it("passes through a fixed failure code", async () => {
    listMonthTransactions.mockResolvedValue(fail("DB_TIMEOUT"));
    expect(
      await fetchTransactionPage({ month: "2031-01", showExcluded: false }),
    ).toEqual({ ok: false, code: "DB_TIMEOUT" });
  });
});

describe("updateTransaction", () => {
  const TXN_ID = "33333333-3333-4333-8333-333333333333";
  const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
  const edit = (extra: Record<string, unknown> = {}) => ({
    transactionId: TXN_ID,
    expectedOwnerEditRevision: "2",
    categoryId: null,
    requestId: REQUEST_ID,
    ...extra,
  });

  it("edits through the override service and revalidates the page", async () => {
    const value = {
      effectiveCategoryId: null,
      effectiveClassification: "spending",
      ownerEditRevision: "3",
    };
    setTransactionOverrides.mockResolvedValue({ ok: true, value: { value } });
    expect(await updateTransaction(edit())).toEqual({ ok: true, value });
    expect(setTransactionOverrides).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      ...edit(),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/spending");
  });

  it.each([
    ["no field to change", { categoryId: undefined }],
    ["an unknown classification", { classification: "gift" }],
    ["a non numeric revision", { expectedOwnerEditRevision: "abc" }],
    ["an owner id", { ownerId: SESSION.ownerId }],
  ])("rejects %s with INVALID_INPUT", async (_name, extra) => {
    expect(await updateTransaction(edit(extra))).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(setTransactionOverrides).not.toHaveBeenCalled();
  });

  it("returns the refetched row on a stale revision conflict", async () => {
    const row = { id: TXN_ID, ownerEditRevision: "5", editable: true };
    setTransactionOverrides.mockResolvedValue(fail("CONFLICT"));
    getTransaction.mockResolvedValue({ ok: true, value: row });
    expect(await updateTransaction(edit())).toEqual({
      ok: false,
      code: "CONFLICT",
      row,
    });
    expect(getTransaction).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      transactionId: TXN_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/spending");
  });

  it("refetches the posted replacement when the pending row was superseded", async () => {
    setTransactionOverrides.mockResolvedValue({
      ...fail("CONFLICT"),
      successorId: CONNECTION_ID,
    });
    getTransaction.mockResolvedValue(fail("NOT_FOUND"));
    expect(await updateTransaction(edit())).toEqual({
      ok: false,
      code: "CONFLICT",
      row: undefined,
    });
    expect(getTransaction).toHaveBeenCalledWith(DB_URL, {
      ownerId: SESSION.ownerId,
      transactionId: CONNECTION_ID,
    });
  });

  it("passes through other failures without refetching", async () => {
    setTransactionOverrides.mockResolvedValue(fail("NOT_FOUND"));
    expect(await updateTransaction(edit())).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(getTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
