import type { Classification } from "./classification";

// Display safe transaction table contract and the /spending URL rules.
// Kept free of server imports so client components can share it.

export const PAGE_SIZE = 50;
export const SEARCH_MAX_LENGTH = 120;
export const UNCATEGORIZED_PARAM = "uncategorized";

export const EXCLUSION_REASONS = [
  "removed",
  "superseded",
  "foreign_currency",
  "transfer",
  "card_payment",
  "income",
  "unclassified_inflow",
  "unclassified_outflow",
] as const;

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  removed: "Removed",
  superseded: "Replaced",
  foreign_currency: "Other currency",
  transfer: "Transfer",
  card_payment: "Card payment",
  income: "Income",
  unclassified_inflow: "Unclassified inflow",
  unclassified_outflow: "Unclassified outflow",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  spending: "Spending",
  refund: "Refund",
  income: "Income",
  transfer: "Transfer",
  card_payment: "Card payment",
  unclassified: "Unclassified",
};

export type TransactionRow = {
  id: string;
  date: string;
  postingState: "pending" | "posted";
  description: string;
  merchantName: string | null;
  accountId: string;
  accountName: string;
  accountSubtype: string | null;
  amountUnits: string;
  currencyCode: string;
  categoryId: string | null;
  categoryLabel: string | null;
  classification: Classification;
  edited: boolean;
  exclusionReason: ExclusionReason | null;
  // Removed and superseded rows are display only.
  editable: boolean;
  ownerEditRevision: string;
};

export type TransactionPage = {
  rows: TransactionRow[];
  nextCursor: string | null;
  matchCount: number;
  filteredPostedUnits: string;
};

export type TransactionFilters = {
  category: string | null;
  account: string | null;
  q: string | null;
  showExcluded: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

// Trimmed and capped; empty search means no search.
export function normalizeSearch(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = raw.trim().slice(0, SEARCH_MAX_LENGTH).trim();
  return value === "" ? null : value;
}

// Escape LIKE metacharacters so the search is a literal substring.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// Reads the table filters from the query string. A malformed category or
// account drops that filter and reports normalized: true; whether a well
// formed id belongs to the owner is checked by the page against its
// filter options.
export function parseTransactionFilters(params: {
  category?: string | string[];
  account?: string | string[];
  q?: string | string[];
  excluded?: string | string[];
}): { filters: TransactionFilters; normalized: boolean } {
  let normalized = false;
  const rawCategory = first(params.category);
  let category: string | null = null;
  if (rawCategory !== undefined && rawCategory !== "") {
    if (rawCategory === UNCATEGORIZED_PARAM || UUID_RE.test(rawCategory)) {
      category = rawCategory.toLowerCase();
    } else {
      normalized = true;
    }
  }
  const rawAccount = first(params.account);
  let account: string | null = null;
  if (rawAccount !== undefined && rawAccount !== "") {
    if (UUID_RE.test(rawAccount)) {
      account = rawAccount.toLowerCase();
    } else {
      normalized = true;
    }
  }
  return {
    filters: {
      category,
      account,
      q: normalizeSearch(first(params.q)),
      showExcluded: first(params.excluded) === "1",
    },
    normalized,
  };
}

export function hasActiveFilter(filters: TransactionFilters): boolean {
  return (
    filters.category !== null || filters.account !== null || filters.q !== null
  );
}

// The shareable URL for a month and its filters. The page cursor never
// enters the URL, so a shared link always opens at the first page.
export function spendingHref(
  month: string,
  filters: Partial<TransactionFilters> = {},
): string {
  const params = new URLSearchParams({ month });
  if (filters.category) params.set("category", filters.category);
  if (filters.account) params.set("account", filters.account);
  if (filters.q) params.set("q", filters.q);
  if (filters.showExcluded) params.set("excluded", "1");
  return `/spending?${params.toString()}`;
}

const CURSOR_RE =
  /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const CURSOR_PATTERN = CURSOR_RE;

// Keyset position: the last row's effective date and id.
export function encodeCursor(date: string, id: string): string {
  return `${date}_${id}`;
}

export function decodeCursor(
  cursor: string,
): { date: string; id: string } | null {
  const match = CURSOR_RE.exec(cursor);
  return match ? { date: match[1], id: match[2] } : null;
}
