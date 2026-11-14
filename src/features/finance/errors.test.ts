import { describe, expect, it } from "vitest";

import { FAILURE_CODES, failure, ok } from "./errors";

// covers: shared failure contract, retry guidance flags only transient codes
describe("failure results", () => {
  it("marks transient database failures retryable and domain failures not", () => {
    const retryable = [
      "DB_UNAVAILABLE",
      "DB_TIMEOUT",
      "COMMIT_UNKNOWN",
      "PROVIDER_UNAVAILABLE",
    ];
    for (const code of retryable) {
      expect(failure(code as never).retryable).toBe(true);
    }
    for (const code of FAILURE_CODES) {
      if (retryable.includes(code)) {
        continue;
      }
      expect(failure(code).retryable).toBe(false);
    }
  });

  it("carries an optional successor id and nothing else unsafe", () => {
    const conflict = failure("CONFLICT", { successorId: "abc" });
    expect(conflict).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(conflict.successorId).toBe("abc");
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });
});
