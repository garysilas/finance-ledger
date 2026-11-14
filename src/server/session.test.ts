import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ query: vi.fn() }));
const cookieGet = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock("@/server/db/finance", () => ({
  runUnitOfWork: vi.fn(
    async (
      _url: string,
      fn: (d: { query: ReturnType<typeof vi.fn> }) => unknown,
    ) => ({
      ok: true,
      value: await fn(db),
    }),
  ),
  OpFailure: class OpFailure extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

import { runUnitOfWork } from "@/server/db/finance";
import { hashPassword } from "./password";
import {
  getSessionByToken,
  passwordMeetsPolicy,
  requireSession,
  resetSignInThrottleForTests,
  revokeCurrentSession,
  SESSION_COOKIE_NAME,
  signIn,
} from "./session";

const url = "postgresql://app@127.0.0.1:5432/ledger";
const PASSWORD = "the owner password";

function sha256(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function ownerRow(passwordHash: string | null) {
  return { id: "owner-1", password_hash: passwordHash };
}

beforeEach(() => {
  db.query.mockReset();
  cookieGet.mockReset();
  vi.mocked(runUnitOfWork).mockClear();
  resetSignInThrottleForTests();
});

// covers: AC-1 sign in, opaque cookie token, stored hash only; AC-8 the
// generic failure and the growing delay after five misses.
describe("signIn", () => {
  it("mints a session and stores only the SHA-256 hash of the token", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [ownerRow(hashPassword(PASSWORD))] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await signIn(url, PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const insert = db.query.mock.calls[1];
    expect(insert[1][2]).toEqual(sha256(result.value.token));
    expect(JSON.stringify(insert[1])).not.toContain(result.value.token);
    expect(result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ["there is no owner row", []],
    ["the owner has no password hash", [ownerRow(null)]],
  ])("returns the generic failure when %s", async (_label, rows) => {
    db.query.mockResolvedValueOnce({ rows });
    const result = await signIn(url, PASSWORD);
    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      retryable: false,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("returns the same generic failure for a wrong password", async () => {
    db.query.mockResolvedValueOnce({
      rows: [ownerRow(hashPassword(PASSWORD))],
    });
    const result = await signIn(url, "not the password");
    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      retryable: false,
    });
  });

  it("does not write a session row on failure", async () => {
    db.query.mockResolvedValueOnce({
      rows: [ownerRow(hashPassword(PASSWORD))],
    });
    await signIn(url, "wrong password");
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("delays the fifth consecutive failure, earlier ones return promptly", async () => {
    const failOnce = async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      return signIn(url, "wrong password");
    };
    for (let i = 0; i < 4; i += 1) {
      await expect(failOnce()).resolves.toMatchObject({ ok: false });
    }

    vi.useFakeTimers();
    try {
      db.query.mockResolvedValueOnce({ rows: [] });
      let settled = false;
      const fifth = signIn(url, "wrong password").then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await fifth).toMatchObject({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the failure count after a successful sign in", async () => {
    const failOnce = async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await signIn(url, "wrong password");
    };
    for (let i = 0; i < 4; i += 1) await failOnce();

    db.query
      .mockResolvedValueOnce({ rows: [ownerRow(hashPassword(PASSWORD))] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(signIn(url, PASSWORD)).resolves.toMatchObject({ ok: true });

    // After the reset the next failure is prompt again, not delayed.
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(signIn(url, "wrong password")).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("passwordMeetsPolicy", () => {
  it("requires at least twelve characters", () => {
    expect(passwordMeetsPolicy("a".repeat(11))).toBe(false);
    expect(passwordMeetsPolicy("a".repeat(12))).toBe(true);
  });
});

// covers: AC-1/AC-2 a token resolves only to a live, unrevoked,
// unexpired row; the slide refresh writes at most once a minute.
describe("getSessionByToken", () => {
  const row = {
    id: "session-1",
    owner_id: "owner-1",
    time_zone: "America/New_York",
    last_seen_at: new Date(),
  };

  it("resolves a live session to its owner and time zone", async () => {
    db.query.mockResolvedValueOnce({ rows: [row] });
    const result = await getSessionByToken(url, "raw-token");
    expect(result).toEqual({
      ok: true,
      value: {
        sessionId: "session-1",
        ownerId: "owner-1",
        timeZone: "America/New_York",
      },
    });
  });

  it("looks sessions up by token hash, never the raw token", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await getSessionByToken(url, "raw-token");
    expect(db.query.mock.calls[0][1][0]).toEqual(sha256("raw-token"));
  });

  it("returns null when no live row matches", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(getSessionByToken(url, "raw-token")).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("slides the expiry only when last seen is over a minute old", async () => {
    db.query.mockResolvedValueOnce({ rows: [row] });
    await getSessionByToken(url, "raw-token");
    expect(db.query).toHaveBeenCalledTimes(1);

    db.query
      .mockResolvedValueOnce({
        rows: [{ ...row, last_seen_at: new Date(Date.now() - 61_000) }],
      })
      .mockResolvedValueOnce({ rows: [] });
    await getSessionByToken(url, "raw-token");
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[2][0]).toContain("SET last_seen_at = now()");
  });
});

// covers: AC-2 the authoritative check behind protected pages and
// actions; a cookie alone never authorizes.
describe("requireSession", () => {
  it("returns null without a session cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireSession(url)).resolves.toBeNull();
    expect(cookieGet).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns null on an empty cookie value", async () => {
    cookieGet.mockReturnValue({ value: "" });
    await expect(requireSession(url)).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns the session for a live cookie token", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "session-1",
          owner_id: "owner-1",
          time_zone: "America/New_York",
          last_seen_at: new Date(),
        },
      ],
    });
    await expect(requireSession(url)).resolves.toEqual({
      sessionId: "session-1",
      ownerId: "owner-1",
      timeZone: "America/New_York",
    });
  });

  it("fails closed to null when the session read fails", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    vi.mocked(runUnitOfWork).mockResolvedValueOnce({
      ok: false,
      code: "DB_UNAVAILABLE",
      retryable: true,
    });
    await expect(requireSession(url)).resolves.toBeNull();
  });
});

// covers: AC-1 sign out revokes the row; no cookie means nothing to do.
describe("revokeCurrentSession", () => {
  it("does nothing when there is no cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(revokeCurrentSession(url)).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("revokes the row matching the hashed cookie token", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(revokeCurrentSession(url)).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(db.query.mock.calls[0][0]).toContain("SET revoked_at = now()");
    expect(db.query.mock.calls[0][1][0]).toEqual(sha256("raw-token"));
  });
});
