// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Freshness } from "./freshness";

afterEach(() => vi.useRealTimers());

describe("Freshness", () => {
  it("AC-10 displays relative age and the exact owner time", () => {
    render(
      <Freshness
        at="2026-11-13T09:00:00.000Z"
        now={new Date("2026-11-13T12:00:00.000Z")}
        timeZone="America/New_York"
      />,
    );
    expect(screen.getByText(/Updated 3 hours ago/)).toBeVisible();
    expect(screen.getByText("Nov 13, 2026, 4:00 AM EST")).toHaveAttribute(
      "datetime",
      "2026-11-13T09:00:00.000Z",
    );
  });

  it.each(["", "not an instant"])("AC-10 shows never updated for %s", (at) => {
    render(<Freshness at={at} timeZone="America/New_York" />);
    expect(screen.getByText("Never updated")).toBeVisible();
  });

  it("AC-10 computes age once without client ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
    render(
      <Freshness at="2026-11-13T09:00:00.000Z" timeZone="America/New_York" />,
    );
    act(() => vi.advanceTimersByTime(3600000));
    expect(screen.getByText(/Updated 3 hours ago/)).toBeVisible();
  });
});
