// Fixed, safe labels and messages for database status outcomes. Shared by the
// status page and the shell health indicator. No server imports, so client and
// server components may both read it.

export type StatusOutcome =
  | "DB_OK"
  | "CONFIG_INVALID"
  | "DB_CONNECTION_FAILED"
  | "DB_AUTH_FAILED"
  | "DB_ACQUIRE_TIMEOUT"
  | "DB_QUERY_TIMEOUT"
  | "DB_QUERY_FAILED";

export const STATE_LABEL: Record<StatusOutcome, string> = {
  DB_OK: "Available",
  CONFIG_INVALID: "Configuration needed",
  DB_CONNECTION_FAILED: "Unavailable",
  DB_AUTH_FAILED: "Unavailable",
  DB_ACQUIRE_TIMEOUT: "Unavailable",
  DB_QUERY_TIMEOUT: "Unavailable",
  DB_QUERY_FAILED: "Unavailable",
};

export const STATE_MESSAGE: Record<StatusOutcome, string> = {
  DB_OK: "The local database is available.",
  CONFIG_INVALID: "Local database settings need attention.",
  DB_CONNECTION_FAILED: "Cannot connect to the local database.",
  DB_AUTH_FAILED: "Database sign in failed. Check your local credentials.",
  DB_ACQUIRE_TIMEOUT: "The database connection check timed out.",
  DB_QUERY_TIMEOUT: "The database query check timed out.",
  DB_QUERY_FAILED: "The database check could not complete.",
};

export const SETUP_DIRECTION =
  "See local setup and troubleshooting in README.md.";
