// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import AppErrorPage from "./error";

describe("AppErrorPage", () => {
  it("AC-11 reports only a safe event and lets the owner retry", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppErrorPage reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ledger could not show this page",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "ledger.page_failed",
        outcome: "PAGE_FAILED",
        durationMs: null,
      }),
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Done.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
