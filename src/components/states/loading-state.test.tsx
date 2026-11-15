// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./loading-state";

describe("LoadingState", () => {
  it("AC-11 announces that content is busy", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("AC-11 preserves a caller label even with no placeholder rows", () => {
    render(<LoadingState label="Loading accounts" rows={0} />);
    expect(
      screen.getByRole("status", { name: "Loading accounts" }),
    ).toHaveAttribute("aria-busy", "true");
  });
});
