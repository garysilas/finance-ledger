import { notFound } from "next/navigation";
import { DateText } from "@/components/finance/date-text";
import { Freshness } from "@/components/finance/freshness";
import { Money } from "@/components/finance/money";
import { MonthLabel } from "@/components/finance/month-label";
import { StatusBadge } from "@/components/finance/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { StaleNotice } from "@/components/states/stale-notice";
import { Button } from "@/components/ui/button";

// Development style reference: every token, the type scale, and the shared
// primitives on static sample values. Never reachable in production.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const sampleInstant = "2026-11-13T09:00:00.000Z";
  const sampleZone = "America/New_York";

  const swatches = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "info",
    "info-foreground",
    "success",
    "success-foreground",
    "warning",
    "warning-foreground",
    "border",
    "input",
    "ring",
    "sidebar",
    "sidebar-foreground",
    "sidebar-primary",
    "sidebar-primary-foreground",
    "sidebar-accent",
    "sidebar-accent-foreground",
    "sidebar-border",
    "sidebar-ring",
    "status-over",
    "status-over-foreground",
    "status-near",
    "status-near-foreground",
    "status-pending",
    "status-pending-foreground",
    "status-stale",
    "status-stale-foreground",
    "chart-1",
    "chart-2",
    "chart-3",
    "chart-4",
    "chart-5",
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Design reference</h1>
        <p className="mt-2 text-muted-foreground">
          Tokens and shared primitives on static sample values. Development
          only.
        </p>
      </header>

      <section aria-labelledby="design-type" className="flex flex-col gap-3">
        <h2
          id="design-type"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Type scale
        </h2>
        <p className="text-2xl font-semibold">Page title</p>
        <p className="text-lg font-medium">Section title</p>
        <p className="text-base">Body text at sixteen pixels.</p>
        <p className="text-sm text-muted-foreground">Secondary text</p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Caption and section labels
        </p>
        <p className="text-3xl font-semibold tabular-nums">$1,234.56</p>
      </section>

      <section aria-labelledby="design-tokens" className="flex flex-col gap-3">
        <h2
          id="design-tokens"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Tokens
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {swatches.map((token) => (
            <li
              key={token}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span
                aria-hidden="true"
                className="size-6 shrink-0 rounded border"
                style={{ backgroundColor: `var(--${token})` }}
              />
              <span className="truncate font-mono text-xs">{token}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="design-money" className="flex flex-col gap-3">
        <h2
          id="design-money"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Money
        </h2>
        <ul className="flex flex-col gap-2 text-base">
          <li>
            Spending positive:{" "}
            <Money units={123456n} currency="USD" context="spending" />
          </li>
          <li>
            Spending net refund:{" "}
            <Money units={-4000n} currency="USD" context="spending" />
          </li>
          <li>
            Transaction outflow:{" "}
            <Money units={-1299n} currency="USD" context="transaction" />
          </li>
          <li>
            Transaction inflow:{" "}
            <Money units={250000n} currency="USD" context="transaction" />
          </li>
          <li>
            Plain negative:{" "}
            <Money units={-77n} currency="USD" context="plain" />
          </li>
          <li>
            JPY (scale 0):{" "}
            <Money units={12000n} currency="JPY" context="plain" />
          </li>
          <li>
            BHD (scale 3):{" "}
            <Money units={123456n} currency="BHD" context="plain" />
          </li>
          <li>
            CAD code: <Money units={9999n} currency="CAD" context="plain" />
          </li>
          <li>
            Unknown currency:{" "}
            <Money units={100n} currency="XXX" context="plain" />
          </li>
          <li>
            Large units:{" "}
            <Money units={123456789012345678n} currency="USD" context="plain" />
          </li>
        </ul>
      </section>

      <section aria-labelledby="design-dates" className="flex flex-col gap-3">
        <h2
          id="design-dates"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Dates and freshness
        </h2>
        <ul className="flex flex-col gap-2 text-base">
          <li>
            Date: <DateText date="2026-11-13" />
          </li>
          <li>
            Month: <MonthLabel month="2026-11" />
          </li>
          <li>
            Freshness: <Freshness at={sampleInstant} timeZone={sampleZone} />
          </li>
        </ul>
      </section>

      <section aria-labelledby="design-badges" className="flex flex-col gap-3">
        <h2
          id="design-badges"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Status badges
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="over" />
          <StatusBadge status="near" />
          <StatusBadge status="pending" />
          <StatusBadge status="stale" />
          <StatusBadge status="excluded" />
        </div>
      </section>

      <section aria-labelledby="design-states" className="flex flex-col gap-4">
        <h2
          id="design-states"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          State patterns
        </h2>
        <LoadingState label="Loading sample rows" />
        <EmptyState
          title="Nothing here yet"
          description="An empty view shows a title, a description, and an optional action."
          action={<Button variant="outline">Take an action</Button>}
        />
        <ErrorState />
        <StaleNotice at={sampleInstant} timeZone={sampleZone} />
      </section>
    </main>
  );
}
