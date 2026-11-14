// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/probe", () => ({ probeWithConfig: vi.fn() }));

import { probeWithConfig } from "@/server/db/probe";
import { HealthIndicator, HealthIndicatorFallback } from "./health-indicator";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  for (const [name, value] of Object.entries({
    POSTGRES_DB: "ledger",
    POSTGRES_USER: "ledger_admin",
    POSTGRES_PASSWORD: "synthetic-bootstrap-password",
    LEDGER_DB_USER: "ledger_app",
    LEDGER_DB_PASSWORD: "synthetic-app-password",
    DATABASE_URL:
      "postgresql://ledger_app:synthetic-app-password@127.0.0.1:5432/ledger",
  }))
    vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HealthIndicator", () => {
  it.each([
    ["DB_OK", "Available"],
    ["DB_CONNECTION_FAILED", "Unavailable"],
    ["DB_AUTH_FAILED", "Unavailable"],
    ["DB_ACQUIRE_TIMEOUT", "Unavailable"],
    ["DB_QUERY_TIMEOUT", "Unavailable"],
    ["DB_QUERY_FAILED", "Unavailable"],
  ] as const)(
    "AC-5 maps %s to a fixed accessible label",
    async (outcome, label) => {
      vi.mocked(probeWithConfig).mockResolvedValueOnce({
        outcome,
        durationMs: 1,
      });
      render(
        <SidebarProvider persist={false}>
          {await HealthIndicator()}
        </SidebarProvider>,
      );
      const link = screen.getByRole("link", { name: `Database: ${label}` });
      expect(link).toHaveAttribute("href", "/status");
      expect(link).toHaveTextContent(label);
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("AC-5 shows configuration needed without contacting the database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    render(
      <SidebarProvider persist={false}>
        {await HealthIndicator()}
      </SidebarProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Database: Configuration needed" }),
    ).toBeVisible();
    expect(probeWithConfig).not.toHaveBeenCalled();
  });

  it("AC-5 names the loading state without starting another probe", () => {
    render(
      <SidebarProvider persist={false}>
        <HealthIndicatorFallback />
      </SidebarProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Database: Checking database" }),
    ).toBeVisible();
    expect(probeWithConfig).not.toHaveBeenCalled();
  });
});
