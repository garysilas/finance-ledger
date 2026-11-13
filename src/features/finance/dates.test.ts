import { describe, expect, it } from "vitest";

import {
  daysInMonth,
  formatDate,
  isLeapYear,
  monthEnd,
  monthOfInstant,
  monthStart,
  nextMonthStart,
  parseCalendarDate,
  parseMonth,
} from "./dates";

// covers: AC-3 (calendar exactness, zone resolved months, DST boundaries)
describe("parseCalendarDate", () => {
  it("accepts ordinary and boundary dates", () => {
    expect(parseCalendarDate("2026-11-12")).toEqual({
      year: 2026,
      month: 11,
      day: 12,
    });
    expect(parseCalendarDate("0001-01-01")).not.toBeNull();
    expect(parseCalendarDate("9999-12-31")).not.toBeNull();
  });

  it("accepts leap February 29 only in leap years", () => {
    expect(parseCalendarDate("2024-02-29")).not.toBeNull();
    expect(parseCalendarDate("2026-02-29")).toBeNull();
    // 2100 is divisible by 4 and 100 but not 400: not a leap year.
    expect(parseCalendarDate("2100-02-29")).toBeNull();
    expect(parseCalendarDate("2000-02-29")).not.toBeNull();
  });

  it("rejects rollovers, timestamps, and malformed spellings", () => {
    for (const value of [
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "2026-01-00",
      "2026-11-12T00:00:00Z",
      "2026-1-5",
      "26-11-12",
      "10000-01-01",
      "0000-01-01",
      "2026-11-12 ",
      "",
      "not-a-date",
    ]) {
      expect(parseCalendarDate(value)).toBeNull();
    }
  });
});

describe("parseMonth", () => {
  it("accepts exact YYYY-MM spellings in range", () => {
    expect(parseMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("0001-01")).toEqual({ year: 1, month: 1 });
    expect(parseMonth("9999-12")).toEqual({ year: 9999, month: 12 });
  });

  it("rejects out of range and malformed months", () => {
    for (const value of [
      "2026-13",
      "2026-00",
      "2026-11-01",
      "0000-01",
      "10000-01",
      "2026-1",
      "",
    ]) {
      expect(parseMonth(value)).toBeNull();
    }
  });
});

describe("month arithmetic", () => {
  it("computes month starts and next month across year boundaries", () => {
    expect(monthStart(2026, 11)).toBe("2026-11-01");
    expect(nextMonthStart(2026, 11)).toBe("2026-12-01");
    expect(nextMonthStart(2026, 12)).toBe("2027-01-01");
    expect(monthEnd(2026, 11)).toBe("2026-11-30");
    expect(monthEnd(2024, 2)).toBe("2024-02-29");
  });

  it("returns no exclusive bound for the final month of year 9999", () => {
    // covers: AC-3, the spec requires an inclusive final date predicate
    // rather than an out of range next month for December 9999.
    expect(nextMonthStart(9999, 12)).toBeNull();
    expect(monthEnd(9999, 12)).toBe("9999-12-31");
    expect(monthStart(9999, 12)).toBe("9999-12-01");
  });
});

describe("monthOfInstant in America/New_York", () => {
  const zone = "America/New_York";

  it("resolves the month in the owner zone, not UTC", () => {
    // 2026-11-01T03:30Z is still Oct 31 23:30 in New York (EDT).
    expect(monthOfInstant(new Date("2026-11-01T03:30:00Z"), zone)).toBe(
      "2026-10",
    );
    // 2026-11-01T05:30Z is Nov 1 01:30 in New York (still EDT).
    expect(monthOfInstant(new Date("2026-11-01T05:30:00Z"), zone)).toBe(
      "2026-11",
    );
  });

  it("keeps the month stable across the fall daylight saving change", () => {
    // DST ends 2026-11-01 at 02:00 local (06:00 UTC). Both sides of the
    // transition remain inside November in New York.
    expect(monthOfInstant(new Date("2026-11-01T05:59:00Z"), zone)).toBe(
      "2026-11",
    );
    expect(monthOfInstant(new Date("2026-11-01T07:01:00Z"), zone)).toBe(
      "2026-11",
    );
  });

  it("keeps the month stable across the spring daylight saving change", () => {
    // DST starts 2026-03-08 at 02:00 local (07:00 UTC); 02:00 to 03:00
    // local does not exist, and the month must not shift either way.
    expect(monthOfInstant(new Date("2026-03-08T06:30:00Z"), zone)).toBe(
      "2026-03",
    );
    expect(monthOfInstant(new Date("2026-03-08T07:30:00Z"), zone)).toBe(
      "2026-03",
    );
    // 2026-03-01T04:30Z is still Feb 28 in New York (EST).
    expect(monthOfInstant(new Date("2026-03-01T04:30:00Z"), zone)).toBe(
      "2026-02",
    );
    expect(monthOfInstant(new Date("2026-03-01T05:30:00Z"), zone)).toBe(
      "2026-03",
    );
  });
});

describe("calendar helpers", () => {
  it("formats with zero padding", () => {
    expect(formatDate(1, 1, 1)).toBe("0001-01-01");
    expect(formatDate(9999, 12, 31)).toBe("9999-12-31");
  });

  it("reports leap year rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});
