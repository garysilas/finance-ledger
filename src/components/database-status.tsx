import {
  SETUP_DIRECTION,
  STATE_LABEL,
  STATE_MESSAGE,
} from "@/components/status-labels";
import { checkDatabaseStatus } from "@/server/status";

export async function DatabaseStatus() {
  const status = await checkDatabaseStatus();

  return (
    <>
      <section
        aria-labelledby="db-status-heading"
        className="rounded-lg border bg-card p-4 text-card-foreground"
      >
        <h2 id="db-status-heading" className="text-lg font-medium">
          Database status
        </h2>
        <p className="mt-2 font-medium">
          Status: {STATE_LABEL[status.outcome]}
        </p>
        <p className="mt-1">{STATE_MESSAGE[status.outcome]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Last checked (UTC):{" "}
          <time dateTime={status.checkedAt}>{status.checkedAt}</time>
        </p>
      </section>

      {status.outcome !== "DB_OK" &&
        status.outcome !== "DB_ACQUIRE_TIMEOUT" &&
        status.outcome !== "DB_QUERY_TIMEOUT" && (
          <p className="text-sm">{SETUP_DIRECTION}</p>
        )}
    </>
  );
}
