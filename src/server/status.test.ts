import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/probe", () => ({
  probeWithConfig: vi.fn(),
  PROBE_BUDGET_MS: 3000,
}));
vi.mock("@/server/diagnostics", () => ({
  logDatabaseProbe: vi.fn(),
}));

import { probeWithConfig } from "@/server/db/probe";
import { logDatabaseProbe } from "@/server/diagnostics";
import { checkDatabaseStatus } from "./status";

const mockedProbe = vi.mocked(probeWithConfig);
const mockedLog = vi.mocked(logDatabaseProbe);

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string> = {
    POSTGRES_DB: "ledger",
    POSTGRES_USER: "ledger_admin",
    POSTGRES_PASSWORD: "bootstrap-secret",
    LEDGER_DB_USER: "ledger_app",
    LEDGER_DB_PASSWORD: "app-secret",
    DATABASE_URL: "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== undefined),
    ) as Record<string, string>,
  };
  for (const key of Object.keys(values)) {
    const override = overrides[key];
    if (override === undefined && !(key in overrides)) {
      process.env[key] = values[key];
    } else if (override === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = override;
    }
  }
}

describe("checkDatabaseStatus", () => {
  it("returns CONFIG_INVALID without probing when settings are missing", async () => {
    setEnv({ DATABASE_URL: undefined });
    const result = await checkDatabaseStatus();
    expect(result.outcome).toBe("CONFIG_INVALID");
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedLog).toHaveBeenCalledWith("CONFIG_INVALID", expect.any(Number));
  });

  it("returns the probe outcome and a UTC timestamp when settings are valid", async () => {
    setEnv();
    mockedProbe.mockResolvedValue({ outcome: "DB_OK", durationMs: 9 });
    const result = await checkDatabaseStatus();
    expect(mockedProbe).toHaveBeenCalledWith(
      "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger",
    );
    expect(result.outcome).toBe("DB_OK");
    expect(result.durationMs).toBe(9);
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it("propagates a failure outcome from the probe", async () => {
    setEnv();
    mockedProbe.mockResolvedValue({
      outcome: "DB_CONNECTION_FAILED",
      durationMs: 2500,
    });
    const result = await checkDatabaseStatus();
    expect(result.outcome).toBe("DB_CONNECTION_FAILED");
  });
});
