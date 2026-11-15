// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it.each([
    [123456n, "USD", "spending", "$1,234.56"],
    [-1299n, "USD", "transaction", "$12.99"],
    [250000n, "USD", "transaction", "+$2,500.00"],
    [-77n, "USD", "plain", "−$0.77"],
    [0n, "USD", "plain", "$0.00"],
    [9999n, "CAD", "plain", "CAD 99.99"],
    [12000n, "JPY", "plain", "JPY 12,000"],
    [123456n, "BHD", "plain", "BHD 123.456"],
    [123456789012345678n, "USD", "plain", "$1,234,567,890,123,456.78"],
  ] as const)(
    "AC-9 displays %s %s in %s context",
    (units, currency, context, text) => {
      render(<Money units={units} currency={currency} context={context} />);
      expect(
        screen.getByText(text, { normalizer: (value) => value }),
      ).toBeVisible();
    },
  );

  it("AC-9 exposes the full refund meaning to screen readers", () => {
    render(<Money units={-4000n} currency="USD" context="spending" />);
    expect(screen.getByText("net refund")).toBeVisible();
    expect(screen.getByText("net refund of 40.00 dollars")).not.toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("−$40.00")).toHaveAttribute("aria-hidden", "true");
  });

  it("AC-9 shows a safe fallback for an unknown currency", () => {
    render(<Money units={100n} currency="XXX" context="plain" />);
    expect(screen.getByText("Amount unavailable")).toBeVisible();
    expect(screen.queryByText("$1.00")).not.toBeInTheDocument();
  });
});
