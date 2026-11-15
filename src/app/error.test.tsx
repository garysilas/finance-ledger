// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "./error";

describe("ErrorPage", () => {
  it("shows the fixed failure message and a Try again control", () => {
    render(<ErrorPage reset={() => {}} />);
    expect(screen.getByRole("heading", { name: "Ledger" })).toBeInTheDocument();
    expect(
      screen.getByText("Ledger could not show this page."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("invokes reset when Try again is activated", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorPage reset={reset} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("is reachable and activatable by keyboard", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorPage reset={reset} />);

    await user.tab();
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("logs a safe ledger.page_failed diagnostic event", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage reset={() => {}} />);
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload).toEqual({
      event: "ledger.page_failed",
      outcome: "PAGE_FAILED",
      durationMs: null,
    });
  });
});
