import { RetryButton } from "@/components/retry-button";
import type { ProbeOutcome } from "@/server/diagnostics";
import { checkDatabaseStatus } from "@/server/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_LABEL: Record<ProbeOutcome, string> = {
  DB_OK: "Available",
  CONFIG_INVALID: "Configuration needed",
  DB_CONNECTION_FAILED: "Unavailable",
  DB_AUTH_FAILED: "Unavailable",
  DB_ACQUIRE_TIMEOUT: "Unavailable",
  DB_QUERY_TIMEOUT: "Unavailable",
  DB_QUERY_FAILED: "Unavailable",
};

const STATE_MESSAGE: Record<ProbeOutcome, string> = {
  DB_OK: "The local database is available.",
  CONFIG_INVALID: "Local database settings need attention.",
  DB_CONNECTION_FAILED: "Cannot connect to the local database.",
  DB_AUTH_FAILED: "Database sign in failed. Check your local credentials.",
  DB_ACQUIRE_TIMEOUT: "The database connection check timed out.",
  DB_QUERY_TIMEOUT: "The database query check timed out.",
  DB_QUERY_FAILED: "The database check could not complete.",
};

const SETUP_DIRECTION =
  "See local setup and troubleshooting in README.md.";

export default async function Home() {
  const status = await checkDatabaseStatus();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold text-zinc-900">Ledger</h1>
        <p className="mt-2 text-zinc-600">
          Local scaffold. This page checks the connection to your local
          database.
        </p>
      </header>

      <section aria-labelledby="db-status-heading" className="rounded border border-zinc-300 p-4">
        <h2 id="db-status-heading" className="text-lg font-medium text-zinc-900">
          Database status
        </h2>
        <p className="mt-2 font-medium text-zinc-900">
          Status: {STATE_LABEL[status.outcome]}
        </p>
        <p className="mt-1 text-zinc-700">{STATE_MESSAGE[status.outcome]}</p>
        <p className="mt-2 text-sm text-zinc-600">
          Last checked (UTC):{" "}
          <time dateTime={status.checkedAt}>{status.checkedAt}</time>
        </p>
      </section>

      {status.outcome !== "DB_OK" && (
        <p className="text-sm text-zinc-700">{SETUP_DIRECTION}</p>
      )}

      <RetryButton />
    </main>
  );
}
