// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each([
    ["over", "Over budget"],
    ["near", "Near limit"],
    ["pending", "Pending"],
    ["stale", "Stale"],
    ["excluded", "Excluded"],
  ] as const)("AC-12 shows text and an icon for %s", (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toBeVisible();
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("AC-12 allows caller wording without losing the icon", () => {
    render(<StatusBadge status="pending" label="Awaiting confirmation" />);
    const badge = screen.getByText("Awaiting confirmation");
    expect(badge.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});
