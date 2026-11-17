import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  LandmarkIcon,
} from "lucide-react";

import { listOwnerAccounts } from "@/features/finance/account-service";
import { listOwnerConnections } from "@/features/finance/connection-service";
import { parseMonth } from "@/features/finance/dates";
import { UNCATEGORIZED_STABLE_KEY } from "@/features/finance/classification";
import { resolveMonthParam } from "@/features/finance/month-param";
import { getMonthlySpending } from "@/features/finance/spending-service";
import {
  UNCATEGORIZED_PARAM,
  parseTransactionFilters,
  spendingHref,
} from "@/features/finance/transaction-params";
import {
  listMonthTransactions,
  listTransactionFilterOptions,
} from "@/features/finance/transaction-service";
import { Freshness } from "@/components/finance/freshness";
import { Money } from "@/components/finance/money";
import { MonthLabel } from "@/components/finance/month-label";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { validateEnv } from "@/server/env";
import { requireSession } from "@/server/session";
import { ConnectButton, RetrySyncButton } from "./connect-button";
import { TransactionsPanel } from "./transactions-panel";

type SearchParams = {
  month?: string | string[];
  category?: string | string[];
  account?: string | string[];
  q?: string | string[];
  excluded?: string | string[];
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!parsed) {
    return month;
  }
  const total = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (year < 1 || year > 9999) {
    return month;
  }
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
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
        message="Settings are missing or invalid, so spending cannot load."
      />,
    );
  }
  const databaseUrl = env.config.databaseUrl;

  const session = await requireSession(databaseUrl);
  if (session === null) {
    redirect("/signin");
  }

  const params = await searchParams;
  const resolved = resolveMonthParam(
    params.month,
    new Date(),
    session.timeZone,
  );
  const parsedFilters = parseTransactionFilters(params);

  const [spending, connections, accounts, options] = await Promise.all([
    getMonthlySpending(databaseUrl, {
      ownerId: session.ownerId,
      month: resolved.month,
    }),
    listOwnerConnections(databaseUrl, { ownerId: session.ownerId }),
    listOwnerAccounts(databaseUrl, { ownerId: session.ownerId }),
    listTransactionFilterOptions(databaseUrl, { ownerId: session.ownerId }),
  ]);

  if (!spending.ok || !connections.ok || !accounts.ok || !options.ok) {
    return frame(
      <ErrorState
        title="Spending could not load"
        message="Something went wrong while reading your stored spending."
      />,
    );
  }

  const conn = connections.value;
  if (conn.length === 0) {
    return frame(
      <>
        <header>
          <h1 className="text-2xl font-semibold">Spending</h1>
          <p className="mt-2 text-muted-foreground">
            Stored spending, balances, and where each month stands.
          </p>
        </header>
        <EmptyState
          icon={LandmarkIcon}
          title="Connect your bank"
          description="Connect one institution through Plaid to import accounts and your first page of transactions. The access token stays encrypted on this machine and never reaches your browser."
          action={<ConnectButton />}
        />
      </>,
    );
  }

  const data = spending.value;
  const partialHistory = conn.some(
    (entry) => entry.state === "active" && !entry.historyComplete,
  );
  const neverSynced = conn.find(
    (entry) => entry.state === "active" && entry.lastSuccessfulSyncAt === null,
  );
  const freshest = conn
    .map((entry) => entry.lastSuccessfulSyncAt)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);

  const institutionById = new Map(
    conn.map((entry) => [entry.connectionId, entry.institutionName]),
  );
  const exclusionCount = Object.values(data.exclusions).reduce(
    (sum, count) => sum + count,
    0,
  );
  const pendingOutflow = BigInt(data.pendingOutflowUnits);
  const pendingRefund = BigInt(data.pendingRefundUnits);
  const categories = [...data.categories]
    .filter(
      (category) => category.spentUnits !== "0" || category.postedCount > 0,
    )
    .sort((a, b) => (BigInt(b.spentUnits) > BigInt(a.spentUnits) ? 1 : -1));
  const categoryParam = (category: {
    categoryId: string;
    stableKey: string;
  }) =>
    category.stableKey === UNCATEGORIZED_STABLE_KEY
      ? UNCATEGORIZED_PARAM
      : category.categoryId;

  // Unknown category or account ids drop that filter with a notice, the
  // same way an invalid month does.
  const { filters } = parsedFilters;
  let filterNormalized = parsedFilters.normalized;
  const categoryById = new Map(
    options.value.categories.map((category) => [category.id, category]),
  );
  if (filters.category !== null && filters.category !== UNCATEGORIZED_PARAM) {
    const match = categoryById.get(filters.category);
    if (match === undefined) {
      filters.category = null;
      filterNormalized = true;
    } else if (match.stableKey === UNCATEGORIZED_STABLE_KEY) {
      filters.category = UNCATEGORIZED_PARAM;
    }
  }
  if (
    filters.account !== null &&
    !options.value.accounts.some((account) => account.id === filters.account)
  ) {
    filters.account = null;
    filterNormalized = true;
  }

  const firstPage = await listMonthTransactions(databaseUrl, {
    ownerId: session.ownerId,
    month: data.month,
    ...(filters.category !== null ? { categoryId: filters.category } : {}),
    ...(filters.account !== null ? { accountId: filters.account } : {}),
    ...(filters.q !== null ? { query: filters.q } : {}),
    showExcluded: filters.showExcluded,
  });

  const activeCategories = options.value.categories.filter(
    (category) => !category.archived,
  );
  const filterCategories = [
    { value: UNCATEGORIZED_PARAM, label: "Uncategorized" },
    ...options.value.categories
      .filter(
        (category) =>
          category.stableKey !== UNCATEGORIZED_STABLE_KEY &&
          (!category.archived || category.id === filters.category),
      )
      .map((category) => ({
        value: category.id,
        label: category.archived
          ? `${category.label} (archived)`
          : category.label,
      })),
  ];
  const filterAccounts = options.value.accounts.map((account) => ({
    id: account.id,
    label: `${account.name}${account.subtype !== null ? ` · ${account.subtype}` : ""}${account.archived ? " (archived)" : ""}`,
  }));

  return frame(
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Spending</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Posted spending for <MonthLabel month={data.month} />.
            {freshest !== undefined ? (
              <>
                {" "}
                <Freshness at={freshest} timeZone={data.timeZone} />
              </>
            ) : null}
          </p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" asChild>
            <Link
              href={spendingHref(shiftMonth(data.month, -1), filters)}
              aria-label="Previous month"
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" size="icon-sm" asChild>
            <Link
              href={spendingHref(shiftMonth(data.month, 1), filters)}
              aria-label="Next month"
            >
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>

      {resolved.normalized ? (
        <p role="alert" className="text-sm text-destructive">
          That month was not valid, so the current month is shown.
        </p>
      ) : null}

      {filterNormalized ? (
        <p role="alert" className="text-sm text-destructive">
          A category or account filter was not found, so it was removed.
        </p>
      ) : null}

      {partialHistory ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border bg-status-pending px-3 py-2 text-sm text-status-pending-foreground"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Only the first page of transaction history is imported so far, so
          older months look emptier than they really are.
        </p>
      ) : null}

      {neverSynced !== undefined ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-status-stale px-3 py-2 text-sm text-status-stale-foreground"
        >
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          The first import for this connection has not finished.
          <RetrySyncButton connectionId={neverSynced.connectionId} />
        </p>
      ) : null}

      <section aria-labelledby="month-total" className="flex flex-col gap-1">
        <h2
          id="month-total"
          className="text-sm font-medium text-muted-foreground"
        >
          Posted spending · <MonthLabel month={data.month} />
        </h2>
        <Money
          units={BigInt(data.postedTotalUnits)}
          currency="USD"
          context="spending"
          className="text-3xl font-semibold"
        />
        {pendingOutflow !== 0n || pendingRefund !== 0n ? (
          <p className="text-sm text-muted-foreground">
            Pending:{" "}
            <Money
              units={pendingOutflow}
              currency="USD"
              context="transaction"
            />
            {pendingRefund !== 0n ? (
              <>
                {" "}
                outflow and{" "}
                <Money
                  units={pendingRefund}
                  currency="USD"
                  context="transaction"
                />{" "}
                refunds
              </>
            ) : (
              " waiting to post"
            )}
          </p>
        ) : null}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="category-breakdown">
          <h2 id="category-breakdown" className="text-sm font-medium">
            By category
          </h2>
          {categories.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No posted spending in <MonthLabel month={data.month} />.
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {categories.map((category) => {
                const value = categoryParam(category);
                const active = filters.category === value;
                return (
                  <li key={category.categoryId}>
                    <Link
                      href={spendingHref(data.month, { category: value })}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "-mx-2 flex h-9 items-center justify-between gap-4 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "bg-muted font-medium",
                      )}
                    >
                      <span>
                        {category.label}
                        <span className="sr-only">, show its transactions</span>
                      </span>
                      <span className="flex items-baseline gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {category.postedCount} posted
                        </span>
                        <Money
                          units={BigInt(category.spentUnits)}
                          currency="USD"
                          context="spending"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {exclusionCount > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {exclusionCount} transaction
              {exclusionCount === 1 ? "" : "s"} not counted: transfers, card
              payments, income, unclassified inflows or outflows, other
              currencies, or removed and replaced records.{" "}
              <Link
                href={spendingHref(data.month, {
                  ...filters,
                  showExcluded: true,
                })}
                scroll={false}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Show them
              </Link>
            </p>
          ) : null}
        </section>

        <section aria-labelledby="account-balances">
          <h2 id="account-balances" className="text-sm font-medium">
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
                          timeZone={data.timeZone}
                        />
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {firstPage.ok ? (
        <TransactionsPanel
          month={data.month}
          filters={filters}
          initial={firstPage.value}
          filterCategories={filterCategories}
          pickerCategories={activeCategories.map((category) => ({
            id: category.id,
            label: category.label,
          }))}
          accounts={filterAccounts}
        />
      ) : (
        <ErrorState
          title="Transactions could not load"
          message="Something went wrong while reading this month's transactions."
          retryLabel="Try again"
        />
      )}
    </>,
  );
}
