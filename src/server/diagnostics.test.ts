import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logDatabaseProbe } from "./diagnostics";

describe("logDatabaseProbe", () => {
  it("emits a ledger.database_probe JSON event with only outcome and duration fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logDatabaseProbe("DB_OK", 42);

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload).toEqual({
      event: "ledger.database_probe",
      outcome: "DB_OK",
      durationMs: 42,
    });
  });

  it("does not include error objects, stack traces, or credentials", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logDatabaseProbe("DB_AUTH_FAILED", 7);

    const raw = spy.mock.calls[0][0] as string;
    expect(raw).not.toMatch(/password|secret|stack|Error/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "durationMs",
      "event",
      "outcome",
    ]);
  });
});
