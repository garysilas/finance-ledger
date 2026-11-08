import "server-only";

export type ProbeOutcome =
  | "DB_OK"
  | "CONFIG_INVALID"
  | "DB_CONNECTION_FAILED"
  | "DB_AUTH_FAILED"
  | "DB_ACQUIRE_TIMEOUT"
  | "DB_QUERY_TIMEOUT"
  | "DB_QUERY_FAILED";

export function logDatabaseProbe(outcome: ProbeOutcome, durationMs: number) {
  console.log(
    JSON.stringify({ event: "ledger.database_probe", outcome, durationMs }),
  );
}
