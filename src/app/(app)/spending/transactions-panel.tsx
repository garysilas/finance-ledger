"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  ClockIcon,
  PencilLineIcon,
  ReceiptTextIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";

import {
  CLASSIFICATION_LABELS,
  EXCLUSION_LABELS,
  SEARCH_MAX_LENGTH,
  hasActiveFilter,
  spendingHref,
  type TransactionFilters,
  type TransactionPage,
  type TransactionRow,
} from "@/features/finance/transaction-params";
import { DateText } from "@/components/finance/date-text";
import { Money } from "@/components/finance/money";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/components/utils";
import { fetchTransactionPage } from "./actions";
import { TransactionEditor, type PickerCategory } from "./transaction-editor";

export type FilterCategory = {
  value: string;
  label: string;
};

export type FilterAccount = {
  id: string;
  label: string;
};

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function RowBadges({ row }: { row: TransactionRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {row.postingState === "pending" ? (
        <Badge variant="info">
          <ClockIcon aria-hidden="true" />
          Pending
        </Badge>
      ) : null}
      {row.edited ? (
        <Badge variant="secondary">
          <PencilLineIcon aria-hidden="true" />
          Edited
        </Badge>
      ) : null}
      {row.exclusionReason !== null ? (
        <Badge variant="outline">
          <BanIcon aria-hidden="true" />
          Not counted: {EXCLUSION_LABELS[row.exclusionReason]}
        </Badge>
      ) : null}
    </span>
  );
}

// The month's transactions under the summary. Filters live in the URL;
// loaded pages live here and reset whenever the server sends a new first
// page (a param change, an edit, or a conflict revalidates the page).
export function TransactionsPanel({
  month,
  filters,
  initial,
  filterCategories,
  pickerCategories,
  accounts,
}: {
  month: string;
  filters: TransactionFilters;
  initial: TransactionPage;
  filterCategories: FilterCategory[];
  pickerCategories: PickerCategory[];
  accounts: FilterAccount[];
}) {
  const router = useRouter();
  const [base, setBase] = useState(initial);
  const [extra, setExtra] = useState<TransactionRow[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [search, setSearch] = useState(filters.q ?? "");
  const [seenQ, setSeenQ] = useState(filters.q);
  const [navigating, startNavigate] = useTransition();
  const [loading, startLoad] = useTransition();

  if (base !== initial) {
    setBase(initial);
    setExtra([]);
    setCursor(initial.nextCursor);
    setLoadFailed(false);
  }
  if (seenQ !== filters.q) {
    setSeenQ(filters.q);
    setSearch(filters.q ?? "");
  }

  const rows = [...initial.rows, ...extra];
  const filtered = hasActiveFilter(filters);

  function navigate(next: Partial<TransactionFilters>) {
    startNavigate(() => {
      router.push(spendingHref(month, { ...filters, ...next }), {
        scroll: false,
      });
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: search.trim() === "" ? null : search.trim() });
  }

  function loadMore() {
    if (cursor === null) {
      return;
    }
    startLoad(async () => {
      const result = await fetchTransactionPage({
        month,
        ...(filters.category !== null ? { categoryId: filters.category } : {}),
        ...(filters.account !== null ? { accountId: filters.account } : {}),
        ...(filters.q !== null ? { query: filters.q } : {}),
        showExcluded: filters.showExcluded,
        cursor,
      });
      if (!result.ok) {
        if (result.code === "SESSION") {
          router.push("/signin");
          return;
        }
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setExtra((previous) => {
        const seen = new Set([
          ...initial.rows.map((row) => row.id),
          ...previous.map((row) => row.id),
        ]);
        return [
          ...previous,
          ...result.page.rows.filter((row) => !seen.has(row.id)),
        ];
      });
      setCursor(result.page.nextCursor);
      setAnnouncement(`Loaded ${result.page.rows.length} more transactions.`);
    });
  }

  return (
    <section aria-labelledby="transactions" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="transactions" className="text-sm font-medium">
          Transactions
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtered ? (
            <>
              {initial.matchCount} matching transaction
              {initial.matchCount === 1 ? "" : "s"} · posted spending{" "}
              <Money
                units={BigInt(initial.filteredPostedUnits)}
                currency="USD"
                context="spending"
                className="font-medium text-foreground"
              />
            </>
          ) : (
            <>
              {initial.matchCount} transaction
              {initial.matchCount === 1 ? "" : "s"}
              {filters.showExcluded ? ", including those not counted" : ""}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Category
          <select
            className={selectClass}
            value={filters.category ?? ""}
            onChange={(event) =>
              navigate({ category: event.target.value || null })
            }
          >
            <option value="">All categories</option>
            {filterCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Account
          <select
            className={selectClass}
            value={filters.account ?? ""}
            onChange={(event) =>
              navigate({ account: event.target.value || null })
            }
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
        <form
          role="search"
          onSubmit={submitSearch}
          className="flex min-w-48 flex-1 items-end gap-1"
        >
          <label className="grid flex-1 gap-1 text-xs font-medium">
            Search this month
            <Input
              type="search"
              value={search}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder="Description or merchant"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" size="icon">
            <SearchIcon aria-hidden="true" />
            <span className="sr-only">Search</span>
          </Button>
        </form>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={filters.showExcluded}
            onChange={(event) =>
              navigate({ showExcluded: event.target.checked })
            }
          />
          Show not counted
        </label>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ category: null, account: null, q: null })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {navigating ? "Updating transactions." : announcement}
      </p>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchXIcon}
            title="No matching transactions"
            description="Nothing in this month matches these filters. Change or clear them to see more."
            action={
              <Button
                variant="outline"
                onClick={() =>
                  navigate({ category: null, account: null, q: null })
                }
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ReceiptTextIcon}
            title="No transactions this month"
            description={
              filters.showExcluded
                ? "No transactions were imported for this month."
                : "No counted transactions this month. Show those not counted to see transfers, payments, and other records."
            }
          />
        )
      ) : (
        <div
          aria-busy={navigating}
          className={cn(
            "rounded-lg border motion-safe:transition-opacity",
            navigating && "opacity-60",
          )}
        >
          <Table aria-label="Transactions table" tabIndex={0}>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="text-end">Amount</TableHead>
                <TableHead>
                  <span className="sr-only">Edit</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "text-sm",
                    row.exclusionReason !== null && "text-muted-foreground",
                  )}
                >
                  <TableCell className="whitespace-nowrap">
                    <DateText date={row.date} />
                  </TableCell>
                  <TableCell className="min-w-56">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">
                        {row.description}
                      </span>
                      {row.merchantName !== null &&
                      row.merchantName !== row.description ? (
                        <span className="text-xs">{row.merchantName}</span>
                      ) : null}
                      <RowBadges row={row} />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.accountName}
                    {row.accountSubtype !== null ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {row.accountSubtype}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.categoryLabel ?? "Uncategorized"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {CLASSIFICATION_LABELS[row.classification]}
                  </TableCell>
                  <TableCell className="text-end whitespace-nowrap text-foreground">
                    <Money
                      units={BigInt(row.amountUnits)}
                      currency={row.currencyCode}
                      context="transaction"
                    />
                  </TableCell>
                  <TableCell className="w-10">
                    {row.editable ? (
                      <TransactionEditor
                        row={row}
                        categories={pickerCategories}
                        onSaved={setAnnouncement}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {cursor !== null || loadFailed ? (
        <div className="flex flex-wrap items-center gap-3">
          {cursor !== null ? (
            <Button variant="outline" onClick={loadMore} isLoading={loading}>
              Load more
            </Button>
          ) : null}
          {loadFailed ? (
            <p role="alert" className="text-sm text-destructive">
              More transactions could not load. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
