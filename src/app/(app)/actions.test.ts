import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validateEnv = vi.hoisted(() => vi.fn());
const revokeMock = vi.hoisted(() => vi.fn());
const cookieDelete = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

vi.mock("@/server/env", () => ({ validateEnv }));
vi.mock("@/server/session", () => ({
  revokeCurrentSession: revokeMock,
  SESSION_COOKIE_NAME: "ledger_session",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: cookieDelete }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signOut } from "./actions";

const DB_URL = "postgresql://app@127.0.0.1:5432/ledger";

beforeEach(() => {
  validateEnv.mockReset().mockReturnValue({
    ok: true,
    config: { databaseUrl: DB_URL },
  });
  revokeMock.mockReset().mockResolvedValue({ ok: true, value: null });
  cookieDelete.mockReset();
  redirectMock.mockClear();
});

// covers: AC-1 sign out revokes the row, always clears the cookie, and
// lands on sign in even when the database is gone.
describe("signOut", () => {
  it("revokes the session, clears the cookie, and redirects to sign in", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/signin");
    expect(revokeMock).toHaveBeenCalledWith(DB_URL);
    expect(cookieDelete).toHaveBeenCalledWith("ledger_session");
  });

  it("still clears the cookie and redirects when settings are invalid", async () => {
    validateEnv.mockReturnValue({ ok: false, code: "CONFIG_INVALID" });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/signin");
    expect(revokeMock).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalledWith("ledger_session");
  });

  it("still clears the cookie when revocation fails", async () => {
    revokeMock.mockResolvedValue({ ok: false, code: "DB_UNAVAILABLE" });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/signin");
    expect(cookieDelete).toHaveBeenCalledWith("ledger_session");
  });
});
