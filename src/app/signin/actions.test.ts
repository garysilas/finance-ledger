import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validateEnv = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const cookieSet = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

vi.mock("@/server/env", () => ({ validateEnv }));
vi.mock("@/server/session", () => ({
  signIn: signInMock,
  SESSION_COOKIE_NAME: "ledger_session",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signInAction } from "./actions";

const ENV_OK = {
  ok: true as const,
  config: { databaseUrl: "postgresql://app@127.0.0.1:5432/ledger" },
};

function form(entries: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  validateEnv.mockReset().mockReturnValue(ENV_OK);
  signInMock.mockReset();
  cookieSet.mockReset();
  redirectMock.mockClear();
});

// covers: AC-1 sign in issues the opaque httpOnly cookie; AC-2/AC-8 the
// generic error leaks nothing about which factor failed.
describe("signInAction", () => {
  it("reports a generic unavailability when settings are invalid", async () => {
    validateEnv.mockReturnValue({ ok: false, code: "CONFIG_INVALID" });
    const state = await signInAction({ error: null }, form());
    expect(state).toEqual({ error: "Sign in is unavailable right now." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("reports a generic failure for a rejected password", async () => {
    signInMock.mockResolvedValue({ ok: false, code: "INVALID_INPUT" });
    const state = await signInAction(
      { error: null },
      form({ password: "wrong" }),
    );
    expect(state).toEqual({ error: "That password did not work." });
    expect(JSON.stringify(state)).not.toContain("INVALID_INPUT");
  });

  it("sets the httpOnly session cookie and redirects to spending by default", async () => {
    const expiresAt = new Date("2031-02-01T00:00:00Z");
    signInMock.mockResolvedValue({
      ok: true,
      value: { token: "opaque-token", expiresAt },
    });
    await expect(
      signInAction({ error: null }, form({ password: "right" })),
    ).rejects.toThrow("NEXT_REDIRECT:/spending");
    expect(cookieSet).toHaveBeenCalledWith("ledger_session", "opaque-token", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      expires: expiresAt,
    });
  });

  it("redirects back to a same origin return path", async () => {
    signInMock.mockResolvedValue({
      ok: true,
      value: { token: "t", expiresAt: new Date() },
    });
    await expect(
      signInAction(
        { error: null },
        form({ password: "right", return: "/spending?month=2031-01" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/spending?month=2031-01");
  });

  it.each([
    ["a protocol relative URL", "//evil.example"],
    ["an absolute URL", "https://evil.example"],
    ["a relative path", "spending"],
    ["an empty value", ""],
  ])("falls back to /spending for %s", async (_label, value) => {
    signInMock.mockResolvedValue({
      ok: true,
      value: { token: "t", expiresAt: new Date() },
    });
    await expect(
      signInAction({ error: null }, form({ password: "right", return: value })),
    ).rejects.toThrow("NEXT_REDIRECT:/spending");
  });

  it("passes an empty password when the field is not a string", async () => {
    signInMock.mockResolvedValue({ ok: false, code: "INVALID_INPUT" });
    const data = new FormData();
    data.set("password", new File(["x"], "f.txt"));
    await signInAction({ error: null }, data);
    expect(signInMock).toHaveBeenCalledWith(ENV_OK.config.databaseUrl, "");
  });
});
