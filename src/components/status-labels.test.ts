import { describe, expect, it } from "vitest";
import { SETUP_DIRECTION, STATE_LABEL, STATE_MESSAGE } from "./status-labels";

describe("database status display", () => {
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
    "AC-4 AC-5 preserves the safe label and message for %s",
    (outcome, label, message) => {
      expect(STATE_LABEL[outcome]).toBe(label);
      expect(STATE_MESSAGE[outcome]).toBe(message);
    },
  );

  it("AC-4 directs the owner to local setup instructions", () => {
    expect(SETUP_DIRECTION).toBe(
      "See local setup and troubleshooting in README.md.",
    );
  });
});
