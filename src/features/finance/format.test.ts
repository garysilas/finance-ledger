import { describe, expect, it } from "vitest";
import {
  formatCalendarDate,
  formatExactInstant,
  formatMoney,
  formatMonthLabel,
  formatRelativeAge,
} from "./format";

describe("formatMoney", () => {
  it.each(["spending", "transaction", "plain"] as const)(
    "AC-9 shows zero without a sign or refund label in %s context",
    (context) => {
      expect(formatMoney(0n, "USD", context)).toEqual({
        ok: true,
        text: "$0.00",
        srText: "0.00 dollars",
      });
    },
  );

  it("AC-9 shows a transaction outflow plainly", () => {
    expect(formatMoney(-1299n, "USD", "transaction")).toEqual({
      ok: true,
      text: "$12.99",
      srText: "12.99 dollars",
    });
  });

  it.each([
    [1n, "USD", "$0.01", "0.01 dollars"],
    [
      -9223372036854775808n,
      "USD",
      "−$92,233,720,368,547,758.08",
      "minus 92,233,720,368,547,758.08 dollars",
    ],
    [1n, "BHD", "BHD 0.001", "BHD 0.001"],
    [10001n, "CLF", "CLF 1.0001", "CLF 1.0001"],
  ] as const)(
    "AC-9 preserves exact minor units for %s %s",
    (units, currency, text, srText) => {
      expect(formatMoney(units, currency, "plain")).toEqual({
        ok: true,
        text,
        srText,
      });
    },
  );

  it.each(["", "usd", "UNKNOWN"])(
    "AC-9 rejects unsupported currency %s",
    (currency) => {
      expect(formatMoney(1n, currency, "plain")).toEqual({ ok: false });
    },
  );
  it("formats a positive spending total plainly", () => {
    const result = formatMoney(123456n, "USD", "spending");
    expect(result).toEqual({
      ok: true,
      text: "$1,234.56",
      srText: "1,234.56 dollars",
    });
  });

  it("labels a negative spending total as a net refund", () => {
    const result = formatMoney(-4000n, "USD", "spending");
    expect(result).toEqual({
      ok: true,
      text: "−$40.00",
      srText: "net refund of 40.00 dollars",
      label: "net refund",
    });
  });

  it("shows a leading plus for a transaction inflow", () => {
    expect(formatMoney(250000n, "USD", "transaction")).toMatchObject({
      ok: true,
      text: "+$2,500.00",
    });
  });

  it("shows a transaction outflow plainly", () => {
    expect(formatMoney(-1299n, "USD", "transaction")).toMatchObject({
      ok: true,
      text: "$12.99",
    });
  });

  it("shows a minus only when negative in plain context", () => {
    expect(formatMoney(-77n, "USD", "plain")).toMatchObject({
      ok: true,
      text: "−$0.77",
    });
    expect(formatMoney(77n, "USD", "plain")).toMatchObject({
      ok: true,
      text: "$0.77",
    });
  });

  it("formats JPY with no fraction", () => {
    expect(formatMoney(12000n, "JPY", "plain")).toMatchObject({
      ok: true,
      text: "JPY 12,000",
    });
  });

  it("formats BHD with three fraction digits", () => {
    expect(formatMoney(123456n, "BHD", "plain")).toMatchObject({
      ok: true,
      text: "BHD 123.456",
    });
  });

  it("shows the ISO code for non USD currencies", () => {
    expect(formatMoney(9999n, "CAD", "plain")).toMatchObject({
      ok: true,
      text: "CAD 99.99",
    });
  });

  it("formats units beyond the safe integer range exactly", () => {
    expect(formatMoney(123456789012345678n, "USD", "plain")).toMatchObject({
      ok: true,
      text: "$1,234,567,890,123,456.78",
    });
  });

  it("fails for an unknown currency", () => {
    expect(formatMoney(100n, "XXX", "plain")).toEqual({ ok: false });
  });
});

describe("formatCalendarDate", () => {
  it.each([
    ["2026-03-08", "Mar 8, 2026"],
    ["2026-11-01", "Nov 1, 2026"],
    ["2024-02-29", "Feb 29, 2024"],
    ["0001-01-01", "Jan 1, 1"],
    ["0099-12-31", "Dec 31, 99"],
    ["9999-12-31", "Dec 31, 9999"],
  ])("AC-10 preserves the calendar date %s", (date, expected) => {
    expect(formatCalendarDate(date)).toBe(expected);
  });
  it.each(["2026-03-08", "2026-11-01"])(
    "renders %s without a zone shift",
    (date) => {
      expect(formatCalendarDate(date)).not.toBeNull();
    },
  );

  it("formats a date as written", () => {
    expect(formatCalendarDate("2026-11-13")).toBe("Nov 13, 2026");
  });

  it("returns null for an invalid date", () => {
    expect(formatCalendarDate("2026-02-30")).toBeNull();
    expect(formatCalendarDate("not a date")).toBeNull();
  });
});

describe("formatMonthLabel", () => {
  it.each([
    ["0001-01", "January 1"],
    ["0099-12", "December 99"],
    ["9999-12", "December 9999"],
  ])("AC-10 preserves the year in month %s", (month, expected) => {
    expect(formatMonthLabel(month)).toBe(expected);
  });
  it("formats a month name and year", () => {
    expect(formatMonthLabel("2026-11")).toBe("November 2026");
  });

  it("returns null for an invalid month", () => {
    expect(formatMonthLabel("2026-13")).toBeNull();
  });
});

describe("formatRelativeAge", () => {
  const at = new Date("2026-11-13T12:00:00.000Z");

  it.each([
    [59, "just now"],
    [60, "1 minute ago"],
    [3599, "59 minutes ago"],
    [3600, "1 hour ago"],
    [86399, "23 hours ago"],
    [86400, "1 day ago"],
    [2591999, "29 days ago"],
    [2592000, "on Nov 13, 2026"],
  ])("AC-10 reports the age at %s seconds", (seconds, expected) => {
    expect(formatRelativeAge(at, new Date(at.getTime() + seconds * 1000))).toBe(
      expected,
    );
  });

  it("says just now under a minute", () => {
    expect(formatRelativeAge(at, new Date("2026-11-13T12:00:30.000Z"))).toBe(
      "just now",
    );
  });

  it("reports minutes, hours, and days", () => {
    expect(formatRelativeAge(at, new Date("2026-11-13T12:05:00.000Z"))).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeAge(at, new Date("2026-11-13T15:00:00.000Z"))).toBe(
      "3 hours ago",
    );
    expect(formatRelativeAge(at, new Date("2026-11-15T12:00:00.000Z"))).toBe(
      "2 days ago",
    );
  });
});

describe("formatExactInstant", () => {
  it.each([
    ["2026-11-01T05:30:00.000Z", "Nov 1, 2026, 1:30 AM EDT"],
    ["2026-11-01T06:30:00.000Z", "Nov 1, 2026, 1:30 AM EST"],
    ["2026-01-01T00:30:00.000Z", "Dec 31, 2025, 7:30 PM EST"],
  ])("AC-10 distinguishes the local instant %s", (instant, expected) => {
    expect(formatExactInstant(new Date(instant), "America/New_York")).toBe(
      expected,
    );
  });
  it("formats in the given time zone", () => {
    const text = formatExactInstant(
      new Date("2026-11-13T17:00:00.000Z"),
      "America/New_York",
    );
    expect(text).toContain("Nov 13, 2026");
    expect(text).toContain("12:00");
  });
});
