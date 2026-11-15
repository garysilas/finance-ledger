import { describe, expect, it } from "vitest";
import { resolveMonthParam } from "./month-param";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const ZONE = "America/New_York";

describe("resolveMonthParam", () => {
  it.each([undefined, "invalid"])(
    "AC-13 uses the owner month at a year boundary for %s",
    (raw) => {
      expect(
        resolveMonthParam(raw, new Date("2027-01-01T00:30:00.000Z"), ZONE),
      ).toEqual({
        month: "2026-12",
        normalized: raw !== undefined,
      });
    },
  );

  it.each(["", "2026-00", "0000-01", "2026-11-01", " 2026-11", "2026-11 "])(
    "AC-13 normalizes invalid month %s",
    (raw) => {
      expect(resolveMonthParam(raw, NOW, ZONE)).toEqual({
        month: "2026-11",
        normalized: true,
      });
    },
  );

  it.each(["0001-01", "9999-12"])(
    "AC-13 accepts supported boundary month %s",
    (raw) => {
      expect(resolveMonthParam(raw, NOW, ZONE)).toEqual({
        month: raw,
        normalized: false,
      });
    },
  );

  it("AC-13 treats an empty array as absent", () => {
    expect(resolveMonthParam([], NOW, ZONE)).toEqual({
      month: "2026-11",
      normalized: false,
    });
  });
  it("resolves an absent value to the current month without normalizing", () => {
    expect(resolveMonthParam(undefined, NOW, ZONE)).toEqual({
      month: "2026-11",
      normalized: false,
    });
  });

  it("accepts a valid month", () => {
    expect(resolveMonthParam("2026-03", NOW, ZONE)).toEqual({
      month: "2026-03",
      normalized: false,
    });
  });

  it.each(["2026-13", "2026-1", "garbage"])(
    "normalizes the present but invalid value %s",
    (raw) => {
      expect(resolveMonthParam(raw, NOW, ZONE)).toEqual({
        month: "2026-11",
        normalized: true,
      });
    },
  );

  it("reads the first entry of an array value", () => {
    expect(resolveMonthParam(["2026-05", "2026-06"], NOW, ZONE)).toEqual({
      month: "2026-05",
      normalized: false,
    });
    expect(resolveMonthParam(["bad", "2026-06"], NOW, ZONE)).toEqual({
      month: "2026-11",
      normalized: true,
    });
  });
});
