// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthLabel } from "./month-label";

describe("MonthLabel", () => {
  it("AC-10 displays the full month and year", () => {
    render(<MonthLabel month="2026-11" />);
    expect(screen.getByText("November 2026")).toHaveAttribute(
      "datetime",
      "2026-11",
    );
  });

  it.each(["", "2026-13", "2026-1"])(
    "AC-10 shows a fallback for month %s",
    (month) => {
      render(<MonthLabel month={month} />);
      expect(screen.getByText("Month unavailable")).toBeVisible();
    },
  );
});
