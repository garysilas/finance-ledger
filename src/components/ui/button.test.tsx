// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("AC-11 does not submit a surrounding form by default", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    const click = vi.fn();
    render(
      <form onSubmit={submit}>
        <Button onClick={click}>Retry</Button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("AC-11 keeps the loading action named but prevents repeat activation", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    render(
      <Button isLoading onClick={click}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it("AC-11 preserves link semantics when rendering a child", () => {
    render(
      <Button asChild>
        <a href="/status">System status</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "System status" })).toHaveAttribute(
      "href",
      "/status",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
