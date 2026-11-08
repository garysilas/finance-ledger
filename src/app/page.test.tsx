// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProbeOutcome } from "@/server/diagnostics";

vi.mock("server-only", () => ({}));
vi.mock("@/server/status", () => ({
  checkDatabaseStatus: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { checkDatabaseStatus } from "@/server/status";
import Home from "./page";

const mockedStatus = vi.mocked(checkDatabaseStatus);

function statusOf(outcome: ProbeOutcome) {
  mockedStatus.mockResolvedValue({
    outcome,
    durationMs: 12,
    checkedAt: "2026-11-08T12:34:56.000Z",
  });
}

async function renderHome() {
  render(await Home());
}

describe("Home status page", () => {
  it("renders the scaffold heading, explanation, and labelled timestamp", async () => {
    statusOf("DB_OK");
    await renderHome();

    expect(
      screen.getByRole("heading", { name: "Ledger", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Local scaffold. This page checks the connection to your local database.",
      ),
    ).toBeInTheDocument();

    const time = screen.getByText("2026-11-08T12:34:56.000Z");
    expect(time).toHaveAttribute("dateTime", "2026-11-08T12:34:56.000Z");
    expect(screen.getByText(/Last checked \(UTC\):/)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["DB_OK", "Available", "The local database is available."],
    [
      "CONFIG_INVALID",
      "Configuration needed",
      "Local database settings need attention.",
    ],
    [
      "DB_CONNECTION_FAILED",
      "Unavailable",
      "Cannot connect to the local database.",
    ],
    [
      "DB_AUTH_FAILED",
      "Unavailable",
      "Database sign in failed. Check your local credentials.",
    ],
    [
      "DB_ACQUIRE_TIMEOUT",
      "Unavailable",
      "The database connection check timed out.",
    ],
    ["DB_QUERY_TIMEOUT", "Unavailable", "The database query check timed out."],
    [
      "DB_QUERY_FAILED",
      "Unavailable",
      "The database check could not complete.",
    ],
  ] as const)(
    "maps %s to label %s and its fixed message",
    async (outcome, label, message) => {
      statusOf(outcome);
      await renderHome();
      expect(screen.getByText(`Status: ${label}`)).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  it("shows the README setup direction only when the database is not available", async () => {
    statusOf("DB_CONNECTION_FAILED");
    await renderHome();
    expect(
      screen.getByText("See local setup and troubleshooting in README.md."),
    ).toBeInTheDocument();
  });

  it("omits the setup direction when the database is available", async () => {
    statusOf("DB_OK");
    await renderHome();
    expect(
      screen.queryByText("See local setup and troubleshooting in README.md."),
    ).not.toBeInTheDocument();
  });
});
