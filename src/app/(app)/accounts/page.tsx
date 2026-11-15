import { redirect } from "next/navigation";
import { InfoIcon, LandmarkIcon } from "lucide-react";

import { listOwnerAccounts } from "@/features/finance/account-service";
import { listOwnerConnections } from "@/features/finance/connection-service";
import { getNetWorth } from "@/features/finance/net-worth-service";
import { Freshness } from "@/components/finance/freshness";
import { Money } from "@/components/finance/money";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { validateEnv } from "@/server/env";
import { requireSession } from "@/server/session";
import { ConnectButton } from "../spending/connect-button";
import { DisconnectButton, ReconnectButton, SyncButton } from "./controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FAILURE_LABELS: Record<string, string> = {
  PROVIDER_UNAVAILABLE: "The bank connection was unavailable",
  NEEDS_RECONNECT: "The connection needs to be reconnected",
  DB_UNAVAILABLE: "The database was unavailable",
  DB_TIMEOUT: "The database timed out",
  COMMIT_UNKNOWN: "The last sync result was uncertain",
};

function failureLabel(code: string): string {
  return FAILURE_LABELS[code] ?? "The last sync did not finish";
}

export default async function AccountsPage() {
  const env = validateEnv();
  const frame = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      {children}
    </div>
  );

  if (!env.ok) {
    return frame(
      <ErrorState
        title="Ledger is not configured"
        message="Settings are missing or invalid, so accounts cannot load."
      />,
    );
  }
  const databaseUrl = env.config.databaseUrl;

  const session = await requireSession(databaseUrl);
  if (session === null) {
    redirect("/signin");
  }

  const [connections, accounts, netWorth] = await Promise.all([
    listOwnerConnections(databaseUrl, { ownerId: session.ownerId }),
    listOwnerAccounts(databaseUrl, { ownerId: session.ownerId }),
    getNetWorth(databaseUrl, { ownerId: session.ownerId }),
  ]);

  if (!connections.ok || !accounts.ok || !netWorth.ok) {
    return frame(
      <ErrorState
        title="Accounts could not load"
        message="Something went wrong while reading your stored accounts."
      />,
    );
  }

  if (connections.value.length === 0) {
    return frame(
      <>
        <header>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="mt-2 text-muted-foreground">
            Balances, sync health, and net worth across your connections.
          </p>
        </header>
        <EmptyState
          icon={LandmarkIcon}
          title="Connect your bank"
          description="Connect one institution through Plaid to import accounts and transactions. The access token stays encrypted on this machine and never reaches your browser."
          action={<ConnectButton />}
        />
      </>,
    );
  }

  const institutionById = new Map(
    connections.value.map((entry) => [
      entry.connectionId,
      entry.institutionName,
    ]),
  );

  return frame(
    <>
      <header>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Balances, sync health, and net worth across your connections.
        </p>
      </header>

      <section aria-labelledby="net-worth" className="flex flex-col gap-1">
        <h2
          id="net-worth"
          className="text-sm font-medium text-muted-foreground"
        >
          Net worth
        </h2>
        <Money
          units={BigInt(netWorth.value.netWorthUnits)}
          currency="USD"
          context="plain"
          className="text-3xl font-semibold"
        />
        <p className="text-sm text-muted-foreground">
          <Money
            units={BigInt(netWorth.value.assetUnits)}
            currency="USD"
            context="plain"
          />{" "}
          in assets minus{" "}
          <Money
            units={BigInt(netWorth.value.liabilityUnits)}
            currency="USD"
            context="plain"
          />{" "}
          owed
        </p>
        {netWorth.value.coverage.length > 0 ? (
          <p
            role="status"
            className="mt-2 flex items-start gap-2 rounded-md border bg-status-stale px-3 py-2 text-sm text-status-stale-foreground"
          >
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {netWorth.value.coverage.length} account
            {netWorth.value.coverage.length === 1 ? "" : "s"} not included in
            net worth:{" "}
            {netWorth.value.coverage
              .map((entry) =>
                entry.reason === "archived"
                  ? `${entry.name} (archived)`
                  : entry.reason === "foreign_currency"
                    ? `${entry.name} (not USD)`
                    : `${entry.name} (no balance)`,
              )
              .join(", ")}
            .
          </p>
        ) : null}
      </section>

      <section aria-labelledby="connection-health">
        <h2 id="connection-health" className="text-sm font-medium">
          Connections
        </h2>
        <ul className="mt-2 divide-y">
          {connections.value.map((conn) => (
            <li key={conn.connectionId} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">
                    {conn.institutionName ?? "Connected institution"}
                  </span>
                  {conn.state === "disconnected" ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · disconnected, no longer updating
                    </span>
                  ) : null}
                  {conn.state === "needs_reconnect" ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · needs reconnecting
                    </span>
                  ) : null}
                  {conn.syncStartedAt !== null ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · sync in progress
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {conn.state === "active" ? (
                    <SyncButton connectionId={conn.connectionId} />
                  ) : null}
                  {conn.state === "needs_reconnect" ? (
                    <ReconnectButton connectionId={conn.connectionId} />
                  ) : null}
                  {conn.state !== "disconnected" ? (
                    <DisconnectButton connectionId={conn.connectionId} />
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {conn.lastSuccessfulSyncAt !== null ? (
                  <Freshness
                    at={conn.lastSuccessfulSyncAt}
                    timeZone={session.timeZone}
                  />
                ) : (
                  "Never synced"
                )}
                {!conn.historyComplete ? (
                  <> · initial history still importing</>
                ) : null}
                {conn.lastSyncFailure !== null ? (
                  <>
                    {" "}
                    · {failureLabel(conn.lastSyncFailure)}
                    {conn.lastSyncAttemptAt !== null ? (
                      <>
                        {" "}
                        (
                        <Freshness
                          at={conn.lastSyncAttemptAt}
                          timeZone={session.timeZone}
                        />
                        )
                      </>
                    ) : null}
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="account-list">
        <h2 id="account-list" className="text-sm font-medium">
          Account balances
        </h2>
        {accounts.value.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No accounts imported yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y">
            {accounts.value.map((account) => (
              <li key={account.accountId} className="py-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    {account.name}
                    {account.subtype !== null ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {account.subtype}
                      </span>
                    ) : null}
                  </span>
                  {account.currentUnits !== null &&
                  account.currencyCode !== null ? (
                    <Money
                      units={BigInt(account.currentUnits)}
                      currency={account.currencyCode}
                      context="plain"
                    />
                  ) : (
                    <span className="text-muted-foreground">No balance</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {institutionById.get(account.connectionId) ?? "Connected"}
                  {account.balanceObservedAt !== null ? (
                    <>
                      {" "}
                      ·{" "}
                      <Freshness
                        at={account.balanceObservedAt}
                        timeZone={session.timeZone}
                      />
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>,
  );
}
