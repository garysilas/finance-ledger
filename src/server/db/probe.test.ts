import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("server-only", () => ({}));
vi.mock("@/server/diagnostics", () => ({
  logDatabaseProbe: vi.fn(),
}));

import { PROBE_BUDGET_MS, probeDatabase } from "./probe";

function fakeClient(): PoolClient {
  return { release: vi.fn() } as unknown as PoolClient;
}

function deps(overrides: {
  connect?: () => Promise<PoolClient>;
  runCheck?: (client: PoolClient) => Promise<unknown>;
  now?: () => number;
}) {
  return {
    connect: overrides.connect ?? (() => Promise.resolve(fakeClient())),
    runCheck:
      overrides.runCheck ?? (() => Promise.resolve([{ "?column?": 1 }])),
    now: overrides.now ?? (() => 0),
  };
}

describe("probeDatabase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns DB_OK and releases the client when the check succeeds", async () => {
    const client = fakeClient();
    const result = await probeDatabase(
      deps({ connect: () => Promise.resolve(client) }),
    );
    expect(result.outcome).toBe("DB_OK");
    expect(client.release).toHaveBeenCalledWith();
  });

  it.each([
    ["ECONNREFUSED", "DB_CONNECTION_FAILED"],
    ["ENOTFOUND", "DB_CONNECTION_FAILED"],
    ["57P01", "DB_CONNECTION_FAILED"],
    ["08006", "DB_CONNECTION_FAILED"],
    ["28P01", "DB_AUTH_FAILED"],
    ["28000", "DB_AUTH_FAILED"],
    ["23505", "DB_QUERY_FAILED"],
    [undefined, "DB_QUERY_FAILED"],
  ])("maps a connect failure with code %s to %s", async (code, expected) => {
    const error = Object.assign(new Error("connect failed"), { code });
    const result = await probeDatabase(
      deps({ connect: () => Promise.reject(error) }),
    );
    expect(result.outcome).toBe(expected);
  });

  it("classifies a connect failure that only carries errno", async () => {
    const error = Object.assign(new Error("dns failure"), {
      errno: "ENOTFOUND",
    });
    const result = await probeDatabase(
      deps({ connect: () => Promise.reject(error) }),
    );
    expect(result.outcome).toBe("DB_CONNECTION_FAILED");
  });

  it("maps a connect failure whose message mentions timeout to DB_ACQUIRE_TIMEOUT", async () => {
    const result = await probeDatabase(
      deps({
        connect: () => Promise.reject(new Error("Connection timeout expired")),
      }),
    );
    expect(result.outcome).toBe("DB_ACQUIRE_TIMEOUT");
  });

  it("returns DB_ACQUIRE_TIMEOUT when acquisition exceeds the probe budget", async () => {
    const resultPromise = probeDatabase(
      deps({ connect: () => new Promise<PoolClient>(() => {}) }),
    );
    await vi.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
    const result = await resultPromise;
    expect(result.outcome).toBe("DB_ACQUIRE_TIMEOUT");
  });

  it("releases a client that arrives after the acquisition deadline", async () => {
    const lateClient = fakeClient();
    let resolveConnect: (client: PoolClient) => void = () => {};
    const resultPromise = probeDatabase(
      deps({
        connect: () =>
          new Promise<PoolClient>((resolve) => {
            resolveConnect = resolve;
          }),
      }),
    );
    await vi.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
    const result = await resultPromise;
    expect(result.outcome).toBe("DB_ACQUIRE_TIMEOUT");

    resolveConnect(lateClient);
    await vi.advanceTimersByTimeAsync(0);
    expect(lateClient.release).toHaveBeenCalled();
  });

  it.each([
    ["57P02", "DB_CONNECTION_FAILED"],
    ["28P01", "DB_AUTH_FAILED"],
    ["XX000", "DB_QUERY_FAILED"],
    [undefined, "DB_QUERY_FAILED"],
  ])("maps a query failure with code %s to %s", async (code, expected) => {
    const client = fakeClient();
    const error = Object.assign(new Error("query failed"), { code });
    const result = await probeDatabase(
      deps({
        connect: () => Promise.resolve(client),
        runCheck: () => Promise.reject(error),
      }),
    );
    expect(result.outcome).toBe(expected);
    expect(client.release).toHaveBeenCalledWith();
  });

  it("returns DB_QUERY_TIMEOUT when the query outlasts the remaining budget", async () => {
    const client = fakeClient();
    const resultPromise = probeDatabase(
      deps({
        connect: () => Promise.resolve(client),
        runCheck: () => new Promise(() => {}),
      }),
    );
    await vi.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
    const result = await resultPromise;
    expect(result.outcome).toBe("DB_QUERY_TIMEOUT");
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("never reports success for work that completes after the deadline", async () => {
    const client = fakeClient();
    let resolveQuery: () => void = () => {};
    const resultPromise = probeDatabase(
      deps({
        connect: () => Promise.resolve(client),
        runCheck: () =>
          new Promise((resolve) => {
            resolveQuery = () => resolve([{ "?column?": 1 }]);
          }),
      }),
    );
    await vi.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
    const result = await resultPromise;
    resolveQuery();
    await vi.advanceTimersByTimeAsync(0);
    expect(result.outcome).toBe("DB_QUERY_TIMEOUT");
  });

  it("returns DB_QUERY_TIMEOUT when the budget is already spent after acquisition", async () => {
    const client = fakeClient();
    let calls = 0;
    const now = () => {
      calls += 1;
      return calls === 1 ? 0 : PROBE_BUDGET_MS + 1;
    };
    const result = await probeDatabase(
      deps({ connect: () => Promise.resolve(client), now }),
    );
    expect(result.outcome).toBe("DB_QUERY_TIMEOUT");
    expect(client.release).toHaveBeenCalledWith();
  });

  it("runs SELECT 1 on the real client when no runCheck is injected", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ "?column?": 1 }] })),
      release: vi.fn(),
    } as unknown as PoolClient;
    const result = await probeDatabase({
      connect: () => Promise.resolve(client),
      runCheck: undefined as never,
      now: () => 0,
    });
    expect(result.outcome).toBe("DB_OK");
    expect(client.query).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith();
  });

  it.each([
    ["no rows", { rows: [] }],
    ["more than one row", { rows: [{ "?column?": 1 }, { "?column?": 1 }] }],
    ["a missing rows array", {}],
  ])(
    "returns DB_QUERY_FAILED when SELECT 1 yields %s",
    async (_label, resultSet) => {
      const client = {
        query: vi.fn(async () => resultSet),
        release: vi.fn(),
      } as unknown as PoolClient;
      const result = await probeDatabase({
        connect: () => Promise.resolve(client),
        runCheck: undefined as never,
        now: () => 0,
      });
      expect(result.outcome).toBe("DB_QUERY_FAILED");
      expect(client.release).toHaveBeenCalledWith();
    },
  );

  it("reports elapsed milliseconds from the injected clock", async () => {
    let t = 0;
    const result = await probeDatabase(
      deps({
        connect: () => {
          t = 12;
          return Promise.resolve(fakeClient());
        },
        runCheck: () => {
          t = 37;
          return Promise.resolve([{ "?column?": 1 }]);
        },
        now: () => t,
      }),
    );
    expect(result.durationMs).toBe(37);
  });
});
