// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaleNotice } from "./stale-notice";

afterEach(() => vi.useRealTimers());

describe("StaleNotice", () => {
  it("AC-11 pairs a warning with the age of the data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
    render(
      <StaleNotice at="2026-11-13T09:00:00.000Z" timeZone="America/New_York" />,
    );
    const notice = within(screen.getByRole("status"));
    expect(notice.getByText("This data may be out of date.")).toBeVisible();
    expect(notice.getByText(/Updated 3 hours ago/)).toBeVisible();
  });

  it("AC-11 retains the warning when no successful update exists", () => {
    render(
      <StaleNotice
        at=""
        timeZone="America/New_York"
        message="Sync is overdue."
      />,
    );
    const notice = within(screen.getByRole("status"));
    expect(notice.getByText("Sync is overdue.")).toBeVisible();
    expect(notice.getByText("Never updated")).toBeVisible();
  });
});
