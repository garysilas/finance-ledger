import { STATE_LABEL, type StatusOutcome } from "@/components/status-labels";
import { checkDatabaseStatus } from "@/server/status";
import { HealthLink, type HealthKind } from "./health-link";

const KIND: Record<StatusOutcome, HealthKind> = {
  DB_OK: "ok",
  CONFIG_INVALID: "settings",
  DB_CONNECTION_FAILED: "failed",
  DB_AUTH_FAILED: "failed",
  DB_ACQUIRE_TIMEOUT: "failed",
  DB_QUERY_TIMEOUT: "failed",
  DB_QUERY_FAILED: "failed",
};

// Rendered inside its own Suspense boundary in the sidebar footer, so the
// shell and the page never wait on the database probe.
export async function HealthIndicator() {
  const status = await checkDatabaseStatus();
  return (
    <HealthLink
      label={STATE_LABEL[status.outcome]}
      kind={KIND[status.outcome]}
    />
  );
}

export function HealthIndicatorFallback() {
  return <HealthLink label="Checking database" kind="checking" />;
}
