// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("AC-11 announces a fixed safe message and supports route retry", async () => {
    const user = userEvent.setup();
    render(<ErrorState />);
    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    expect(
      within(alert).getByText("Ledger could not show this content."),
    ).toBeVisible();
    await user.click(
      within(alert).getByRole("button", { name: "Check again" }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Check complete.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("AC-11 retries a caller action by keyboard and announces completion", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} retryLabel="Try again" />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Done.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
