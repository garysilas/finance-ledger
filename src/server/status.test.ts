import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    ...(Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
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

describe("status request sharing", () => {
  it.runIf(process.env.LEDGER_SHELL_INTEGRATION === "1")(
    "AC-5 shares database checks across consumers and streams content before they settle",
    async () => {
      const databaseStub = `
        import { createRequire } from "node:module";
        const { Pool } = createRequire(process.cwd() + "/package.json")("pg");
        Pool.prototype.connect = async function () {
          console.log(JSON.stringify({ event: "test.database_connect" }));
          await new Promise((resolve) => setTimeout(resolve, 1000));
          throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
        };
      `;
      const server = spawn(
        process.execPath,
        [
          "--import",
          `data:text/javascript,${encodeURIComponent(databaseStub)}`,
          "node_modules/next/dist/bin/next",
          "start",
          "-H",
          "127.0.0.1",
          "-p",
          "3000",
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: "production",
            NEXT_TELEMETRY_DISABLED: "1",
            POSTGRES_DB: "ledger",
            POSTGRES_USER: "ledger_admin",
            POSTGRES_PASSWORD: "synthetic-bootstrap-password",
            LEDGER_DB_USER: "ledger_app",
            LEDGER_DB_PASSWORD: "synthetic-app-password",
            DATABASE_URL:
              "postgresql://ledger_app:synthetic-app-password@127.0.0.1:5432/ledger",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      const exited = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("The test server did not become ready.")),
            30000,
          );
          server.once("error", reject);
          server.once("exit", () => {
            clearTimeout(timeout);
            reject(
              new Error(
                "The test server exited before it was ready. Build the app and free port 3000 first.",
              ),
            );
          });
          server.stderr.resume();
          server.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
            if (output.includes("Ready in")) {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
        let initialHtml = "";
        for (let requests = 1; requests <= 2; requests++) {
          const response = await fetch("http://127.0.0.1:3000/status", {
            headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
          });
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let html = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            html += text;
            if (
              requests === 1 &&
              !output.includes('"event":"ledger.database_probe"')
            )
              initialHtml += text;
          }
          expect(response.status).toBe(200);
          expect(html).toContain("System status");
          expect(html).toContain("Database:");
          await vi.waitFor(() => {
            expect(
              output.match(/"event":"ledger.database_probe"/g) ?? [],
            ).toHaveLength(requests);
          });
          expect(
            output.match(/"event":"test.database_connect"/g) ?? [],
          ).toHaveLength(requests);
        }
        expect
          .soft(
            initialHtml.includes("Checking database"),
            "AC-5 streams the health fallback before the probe settles",
          )
          .toBe(true);
        expect
          .soft(
            initialHtml.includes("Ledger"),
            "AC-5 streams the shell before the probe settles",
          )
          .toBe(true);
        expect
          .soft(
            /<h1[^>]*>System status<\/h1>/.test(initialHtml),
            "AC-5 streams the page heading before the probe settles",
          )
          .toBe(true);
      } finally {
        server.kill("SIGTERM");
        await exited;
      }
    },
    60000,
  );
});

describe("checkDatabaseStatus", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it.each([
    "DB_CONNECTION_FAILED",
    "DB_AUTH_FAILED",
    "DB_ACQUIRE_TIMEOUT",
    "DB_QUERY_TIMEOUT",
    "DB_QUERY_FAILED",
  ] as const)(
    "AC-5 returns only safe display values for %s",
    async (outcome) => {
      setEnv();
      mockedProbe.mockResolvedValue({ outcome, durationMs: 42 });

      expect(await checkDatabaseStatus()).toEqual({
        outcome,
        durationMs: 42,
        checkedAt: "2026-11-13T12:00:00.000Z",
      });
    },
  );

  it("AC-5 stamps the time when the probe finishes", async () => {
    setEnv();
    mockedProbe.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-11-13T12:00:02.000Z"));
      return { outcome: "DB_OK", durationMs: 2000 };
    });

    expect((await checkDatabaseStatus()).checkedAt).toBe(
      "2026-11-13T12:00:02.000Z",
    );
  });
  it("returns CONFIG_INVALID without probing when settings are missing", async () => {
    setEnv({ DATABASE_URL: undefined });
    const result = await checkDatabaseStatus();
    expect(result.outcome).toBe("CONFIG_INVALID");
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedLog).toHaveBeenCalledWith(
      "CONFIG_INVALID",
      expect.any(Number),
    );
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
