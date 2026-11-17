// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";

import type {
  TransactionFilters,
  TransactionPage,
  TransactionRow,
} from "@/features/finance/transaction-params";

const fetchTransactionPage = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  fetchTransactionPage,
  updateTransaction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TransactionsPanel } from "./transactions-panel";

const FILTERS: TransactionFilters = {
  category: null,
  account: null,
  q: null,
  showExcluded: false,
};

const ROW: TransactionRow = {
  id: "33333333-3333-4333-8333-333333333333",
  date: "2031-01-15",
  postingState: "posted",
  description: "Corner Cafe",
  merchantName: null,
  accountId: "55555555-5555-4555-8555-555555555555",
  accountName: "Checking",
  accountSubtype: null,
  amountUnits: "-1200",
  currencyCode: "USD",
  categoryId: null,
  categoryLabel: null,
  classification: "spending",
  edited: false,
  exclusionReason: null,
  editable: true,
  ownerEditRevision: "4",
};

const PAGE: TransactionPage = {
  rows: [ROW],
  nextCursor: null,
  matchCount: 1,
  filteredPostedUnits: "-1200",
};

function renderPanel(over: Partial<Parameters<typeof TransactionsPanel>[0]>) {
  return render(
    <TransactionsPanel
      month="2031-01"
      filters={FILTERS}
      initial={PAGE}
      filterCategories={[]}
      pickerCategories={[]}
      accounts={[]}
      {...over}
    />,
  );
}

beforeEach(() => {
  fetchTransactionPage.mockReset();
  push.mockReset();
});

describe("TransactionsPanel", () => {
  it("gives the section and the scrollable table region unique names", () => {
    render(
      <TransactionsPanel
        month="2031-01"
        filters={FILTERS}
        initial={PAGE}
        filterCategories={[]}
        pickerCategories={[]}
        accounts={[]}
      />,
    );
    const names = screen
      .getAllByRole("region")
      .map(
        (region) =>
          region.getAttribute("aria-label") ??
          document.getElementById(region.getAttribute("aria-labelledby") ?? "")
            ?.textContent,
      );
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Transactions");
    expect(names).toContain("Transactions table");
  });

  it("renders merchant, subtype, badges, and an Uncategorized fallback", () => {
    renderPanel({
      initial: {
        ...PAGE,
        rows: [
          {
            ...ROW,
            postingState: "pending",
            merchantName: "Cafe Merchant",
            accountSubtype: "checking",
            edited: true,
          },
          {
            ...ROW,
            id: "44444444-4444-4444-8444-444444444444",
            description: "Gone",
            exclusionReason: "removed",
            editable: false,
          },
        ],
        matchCount: 2,
      },
    });
    expect(screen.getByText("Cafe Merchant")).toBeInTheDocument();
    expect(screen.getByText("· checking")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.getByText("Not counted: Removed")).toBeInTheDocument();
    expect(screen.getAllByText("Uncategorized")).not.toHaveLength(0);
    expect(
      screen.queryByRole("button", {
        name: "Edit category and classification for Gone",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty month state and the no matches state by filter", () => {
    const { unmount } = renderPanel({
      initial: { ...PAGE, rows: [], matchCount: 0 },
    });
    expect(screen.getByText("No transactions this month")).toBeInTheDocument();
    unmount();

    renderPanel({
      filters: { ...FILTERS, q: "zzz" },
      initial: { ...PAGE, rows: [], matchCount: 0 },
    });
    expect(screen.getByText("No matching transactions")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Clear filters" }).length,
    ).toBeGreaterThan(0);
  });

  it("announces the match count and posted sum while filtered", () => {
    renderPanel({
      filters: { ...FILTERS, category: "uncategorized" },
      initial: { ...PAGE, matchCount: 7, filteredPostedUnits: "12345" },
    });
    expect(
      screen.getByText(/7 matching transactions · posted spending/),
    ).toBeInTheDocument();
  });

  it("appends the next page without repeats and hides Load more at the end", async () => {
    const user = userEvent.setup();
    const extra = {
      ...ROW,
      id: "44444444-4444-4444-8444-444444444444",
      description: "Second",
    };
    fetchTransactionPage.mockResolvedValue({
      ok: true,
      page: {
        rows: [extra, ROW],
        nextCursor: null,
        matchCount: 3,
        filteredPostedUnits: "-1200",
      },
    });
    renderPanel({
      initial: {
        ...PAGE,
        nextCursor: `2031-01-15_${ROW.id}`,
        matchCount: 3,
      },
    });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchTransactionPage).toHaveBeenCalledWith(
      expect.objectContaining({
        month: "2031-01",
        showExcluded: false,
        cursor: `2031-01-15_${ROW.id}`,
      }),
    );
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.getAllByText("Corner Cafe")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a load failure and sends an expired session to sign in", async () => {
    const user = userEvent.setup();
    const initial = {
      ...PAGE,
      nextCursor: `2031-01-15_${ROW.id}`,
      matchCount: 3,
    };
    fetchTransactionPage.mockResolvedValue({ ok: false, code: "DB_TIMEOUT" });
    const { unmount } = renderPanel({ initial });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByText("More transactions could not load. Try again."),
    ).toBeInTheDocument();
    unmount();

    fetchTransactionPage.mockResolvedValue({ ok: false, code: "SESSION" });
    renderPanel({ initial });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(push).toHaveBeenCalledWith("/signin");
  });

  it("pushes filter changes into the URL", async () => {
    const user = userEvent.setup();
    renderPanel({
      filterCategories: [{ value: "uncategorized", label: "Uncategorized" }],
      filters: { ...FILTERS, q: "old" },
    });
    await user.clear(screen.getByLabelText("Search this month"));
    await user.type(screen.getByLabelText("Search this month"), "cafe");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenLastCalledWith(
      "/spending?month=2031-01&q=cafe",
      { scroll: false },
    );

    await user.click(screen.getByRole("checkbox", { name: "Show not counted" }));
    expect(push).toHaveBeenLastCalledWith(
      "/spending?month=2031-01&q=old&excluded=1",
      { scroll: false },
    );

    await user.click(
      screen.getAllByRole("button", { name: "Clear filters" })[0],
    );
    expect(push).toHaveBeenLastCalledWith("/spending?month=2031-01", {
      scroll: false,
    });
  });
});
