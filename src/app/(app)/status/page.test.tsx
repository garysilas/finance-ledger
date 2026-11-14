// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const checkDatabaseStatus = vi.fn();
let databaseContent: React.ReactNode;
vi.mock("@/components/database-status", () => ({
  DatabaseStatus: () => databaseContent,
}));
vi.mock("@/server/status", () => ({
  checkDatabaseStatus: () => checkDatabaseStatus(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import StatusPage from "./page";

const { DatabaseStatus } = await vi.importActual<
  typeof import("@/components/database-status")
>("@/components/database-status");

async function renderPage() {
  databaseContent = await DatabaseStatus();
  render(<StatusPage />);
}

const CHECKED_AT = "2026-11-08T12:00:00.000Z";

function statusOf(outcome: string) {
  checkDatabaseStatus.mockResolvedValue({ outcome, checkedAt: CHECKED_AT });
}

describe("StatusPage", () => {
  // spec 0001 scaffold surface: literal copy and landmark structure
  it("renders the scaffold copy, status section, and timestamp", async () => {
    statusOf("DB_OK");
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "System status", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page checks the connection to your local database.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Database status", level: 2 }),
    ).toBeInTheDocument();
    const time = screen.getByText(CHECKED_AT);
    expect(time).toHaveAttribute("datetime", CHECKED_AT);
    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
  });

  // spec 0001 outcome table: each code maps to one fixed state and message
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
  ])(
    "shows state %s and the fixed message for %s",
    async (outcome, label, message) => {
      statusOf(outcome);
      await renderPage();
      expect(screen.getByText(`Status: ${label}`)).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  const DIRECTION = "See local setup and troubleshooting in README.md.";

  // spec 0001: setup direction is part of the action only for settings and
  // connection or auth failures, not for a healthy check or the timeouts
  it.each([
    "CONFIG_INVALID",
    "DB_CONNECTION_FAILED",
    "DB_AUTH_FAILED",
    "DB_QUERY_FAILED",
  ])("shows the setup direction for %s", async (outcome) => {
    statusOf(outcome);
    await renderPage();
    expect(screen.getByText(DIRECTION)).toBeInTheDocument();
  });

  it.each(["DB_OK", "DB_ACQUIRE_TIMEOUT", "DB_QUERY_TIMEOUT"])(
    "hides the setup direction for %s",
    async (outcome) => {
      statusOf(outcome);
      await renderPage();
      expect(screen.queryByText(DIRECTION)).not.toBeInTheDocument();
    },
  );
});
