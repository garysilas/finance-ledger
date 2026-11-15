// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateText } from "./date-text";

describe("DateText", () => {
  it.each([
    ["2026-03-08", "Mar 8, 2026"],
    ["2026-11-01", "Nov 1, 2026"],
  ])("AC-10 displays date %s without a time zone shift", (date, text) => {
    render(<DateText date={date} />);
    expect(screen.getByText(text)).toHaveAttribute("datetime", date);
  });

  it.each(["", "2026-02-30", "not a date"])(
    "AC-10 shows a fallback for %s",
    (date) => {
      render(<DateText date={date} />);
      expect(screen.getByText("Date unavailable")).toBeVisible();
      expect(screen.queryByRole("time")).not.toBeInTheDocument();
    },
  );
});
