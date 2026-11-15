// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AppNotFound from "./not-found";

describe("AppNotFound", () => {
  it("AC-11 explains a missing page and offers a keyboard reachable destination", async () => {
    const user = userEvent.setup();
    render(<AppNotFound />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    expect(
      screen.getByText("Ledger has no page at this address."),
    ).toBeVisible();
    await user.tab();
    const link = screen.getByRole("link", { name: "Go to system status" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "/status");
  });
});
