// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransactionRow } from "@/features/finance/transaction-params";

const updateTransaction = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ updateTransaction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TransactionEditor } from "./transaction-editor";

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
  categoryId: "66666666-6666-4666-8666-666666666666",
  categoryLabel: "Dining",
  classification: "refund",
  edited: false,
  exclusionReason: null,
  editable: true,
  ownerEditRevision: "4",
};

const CATEGORIES = [
  { id: "66666666-6666-4666-8666-666666666666", label: "Dining" },
  { id: "77777777-7777-4777-8777-777777777777", label: "Groceries" },
];

beforeAll(() => {
  // cmdk and Radix measure layout that jsdom does not provide.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  updateTransaction.mockReset();
  push.mockReset();
});

async function open(onSaved = vi.fn()) {
  const user = userEvent.setup();
  render(
    <TransactionEditor row={ROW} categories={CATEGORIES} onSaved={onSaved} />,
  );
  await user.click(
    screen.getByRole("button", {
      name: "Edit category and classification for Corner Cafe",
    }),
  );
  return { user, onSaved };
}

// covers spec 0007 AC-6 (sign valid choices, reset, override service) and
// AC-7 (conflict notice and retry on fresh data).
describe("TransactionEditor", () => {
  it("disables sign invalid classifications for an inflow and marks the current one", async () => {
    await open();
    expect(screen.getByRole("button", { name: /^Spending/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refund" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });

  it("saves a classification with the row revision and closes", async () => {
    updateTransaction.mockResolvedValue({ ok: true });
    const { user, onSaved } = await open();
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: ROW.id,
        expectedOwnerEditRevision: "4",
        classification: "transfer",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("Saved changes to Corner Cafe.");
    expect(screen.queryByText("Edit transaction")).not.toBeInTheDocument();
  });

  it("resets a field to the provider value with null", async () => {
    updateTransaction.mockResolvedValue({ ok: true });
    const { user } = await open();
    await user.click(
      screen.getByRole("button", { name: "Use provider category" }),
    );
    expect(updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
    );
  });

  it("shows the conflict notice and retries on the refetched revision", async () => {
    updateTransaction.mockResolvedValueOnce({
      ok: false,
      code: "CONFLICT",
      row: { ...ROW, ownerEditRevision: "6", classification: "transfer" },
    });
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This transaction changed before your edit saved.",
    );
    expect(screen.getByRole("button", { name: "Transfer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    updateTransaction.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(updateTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedOwnerEditRevision: "6" }),
    );
  });

  it("locks the editor when the refetched row is no longer editable", async () => {
    updateTransaction.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      row: { ...ROW, editable: false, exclusionReason: "removed" },
    });
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "can no longer be edited",
    );
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  });

  it("sends the owner to sign in when the session ended", async () => {
    updateTransaction.mockResolvedValue({ ok: false, code: "SESSION" });
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(push).toHaveBeenCalledWith("/signin");
  });
});
