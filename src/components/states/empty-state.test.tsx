// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("AC-11 explains the empty view without inventing an action", () => {
    render(
      <EmptyState
        title="No accounts"
        description="Connect an account to begin."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No accounts", level: 2 }),
    ).toBeVisible();
    expect(screen.getByText("Connect an account to begin.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("AC-11 makes the optional action reachable by keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No accounts"
        description="Connect an account to begin."
        action={<Button onClick={onClick}>Connect account</Button>}
      />,
    );
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Connect account" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
