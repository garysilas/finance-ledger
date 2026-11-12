// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { RetryButton } from "./retry-button";

describe("RetryButton", () => {
  it("renders an enabled button labelled Check again", () => {
    render(<RetryButton />);
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("calls router.refresh once when activated", async () => {
    const user = userEvent.setup();
    render(<RetryButton />);

    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("announces completion through a polite live region after a check", async () => {
    const user = userEvent.setup();
    render(<RetryButton />);

    await user.click(screen.getByRole("button", { name: "Check again" }));

    const announcement = await screen.findByText("Check complete.");
    expect(announcement).toHaveAttribute("aria-live", "polite");
  });

  it("is reachable and activatable by keyboard", async () => {
    const user = userEvent.setup();
    render(<RetryButton />);

    await user.tab();
    const button = screen.getByRole("button", { name: "Check again" });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
