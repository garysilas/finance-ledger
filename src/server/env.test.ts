import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateEnv } from "./env";

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    POSTGRES_DB: "ledger",
    POSTGRES_USER: "ledger_admin",
    POSTGRES_PASSWORD: "bootstrap-secret",
    LEDGER_DB_USER: "ledger_app",
    LEDGER_DB_PASSWORD: "app-secret",
    DATABASE_URL: "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger",
  };
}

describe("validateEnv", () => {
  it("accepts a complete, consistent configuration", () => {
    const result = validateEnv(validEnv());
    expect(result).toEqual({
      ok: true,
      config: {
        databaseUrl: "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger",
      },
    });
  });

  it.each([
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "LEDGER_DB_USER",
    "LEDGER_DB_PASSWORD",
    "DATABASE_URL",
  ])("rejects when %s is missing", (key) => {
    const env = validEnv();
    delete env[key];
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it.each([
    ["POSTGRES_DB", "Ledger"],
    ["POSTGRES_DB", "-ledger"],
    ["POSTGRES_DB", "ledger db"],
    ["POSTGRES_USER", "admin$"],
    ["LEDGER_DB_USER", "9app"],
    ["LEDGER_DB_USER", `a`.repeat(64)],
  ])("rejects invalid identifier %s=%s", (key, value) => {
    const env = { ...validEnv(), [key]: value };
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it("rejects when the application user equals the bootstrap user", () => {
    const env = {
      ...validEnv(),
      LEDGER_DB_USER: "ledger_admin",
      DATABASE_URL:
        "postgresql://ledger_admin:app-secret@127.0.0.1:5432/ledger",
    };
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it("rejects when the application password equals the bootstrap password", () => {
    const env = {
      ...validEnv(),
      LEDGER_DB_PASSWORD: "bootstrap-secret",
      DATABASE_URL:
        "postgresql://ledger_app:bootstrap-secret@127.0.0.1:5432/ledger",
    };
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it.each([
    ["a non-URL value", "not a url"],
    [
      "a postgres scheme other than postgresql:",
      "postgres://ledger_app:app-secret@127.0.0.1:5432/ledger",
    ],
    [
      "a non-loopback host",
      "postgresql://ledger_app:app-secret@localhost:5432/ledger",
    ],
    ["an implicit port", "postgresql://ledger_app:app-secret@127.0.0.1/ledger"],
    [
      "a different port",
      "postgresql://ledger_app:app-secret@127.0.0.1:5433/ledger",
    ],
    [
      "a database name that differs from POSTGRES_DB",
      "postgresql://ledger_app:app-secret@127.0.0.1:5432/other",
    ],
    [
      "query options",
      "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger?sslmode=disable",
    ],
    [
      "a fragment",
      "postgresql://ledger_app:app-secret@127.0.0.1:5432/ledger#frag",
    ],
    [
      "a username that differs from LEDGER_DB_USER",
      "postgresql://someone:app-secret@127.0.0.1:5432/ledger",
    ],
    [
      "a password that differs from LEDGER_DB_PASSWORD",
      "postgresql://ledger_app:wrong@127.0.0.1:5432/ledger",
    ],
    ["missing credentials", "postgresql://127.0.0.1:5432/ledger"],
  ])("rejects DATABASE_URL with %s", (_label, url) => {
    const env = { ...validEnv(), DATABASE_URL: url };
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it("accepts the maximum 63 character identifier", () => {
    const db = `a${"b".repeat(62)}`;
    const env = {
      ...validEnv(),
      POSTGRES_DB: db,
      DATABASE_URL: `postgresql://ledger_app:app-secret@127.0.0.1:5432/${db}`,
    };
    expect(validateEnv(env)).toEqual({
      ok: true,
      config: { databaseUrl: env.DATABASE_URL },
    });
  });

  it("accepts a URL encoded username that decodes to the configured value", () => {
    const env = {
      ...validEnv(),
      DATABASE_URL:
        "postgresql://ledger%5Fapp:app-secret@127.0.0.1:5432/ledger",
    };
    expect(validateEnv(env)).toEqual({
      ok: true,
      config: { databaseUrl: env.DATABASE_URL },
    });
  });

  it("rejects a DATABASE_URL with a malformed percent escape", () => {
    const env = {
      ...validEnv(),
      DATABASE_URL: "postgresql://ledger_app:%E0%A4%A@127.0.0.1:5432/ledger",
    };
    expect(validateEnv(env)).toEqual({ ok: false });
  });

  it("accepts a URL encoded password that decodes to the configured value", () => {
    const env = {
      ...validEnv(),
      LEDGER_DB_PASSWORD: "p@ss/word",
      DATABASE_URL:
        "postgresql://ledger_app:p%40ss%2Fword@127.0.0.1:5432/ledger",
    };
    expect(validateEnv(env)).toEqual({
      ok: true,
      config: { databaseUrl: env.DATABASE_URL },
    });
  });

  it("uses process.env when no source is given", () => {
    const backup = { ...process.env };
    try {
      for (const key of Object.keys(validEnv())) delete process.env[key];
      expect(validateEnv()).toEqual({ ok: false });
    } finally {
      process.env = backup;
    }
  });
});
