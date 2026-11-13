import { describe, expect, it } from "vitest";

import {
  CURRENCY_SCALE_REGISTRY_EDITION,
  currencyScale,
  parseMoneyToUnits,
  unitsInRange,
} from "./money";

// covers: AC-2 (exact minor units, explicit scale, no rounding)
describe("parseMoneyToUnits", () => {
  it("converts USD decimal strings exactly", () => {
    expect(parseMoneyToUnits("12.34", "USD")).toEqual({
      ok: true,
      value: { units: 1234n, scale: 2 },
    });
    expect(parseMoneyToUnits("0.00", "USD")).toEqual({
      ok: true,
      value: { units: 0n, scale: 2 },
    });
    expect(parseMoneyToUnits("1000", "USD")).toEqual({
      ok: true,
      value: { units: 100000n, scale: 2 },
    });
  });

  it("preserves sign for refunds and inflows", () => {
    expect(parseMoneyToUnits("-5.00", "USD")).toEqual({
      ok: true,
      value: { units: -500n, scale: 2 },
    });
    expect(parseMoneyToUnits("+3.50", "USD")).toEqual({
      ok: true,
      value: { units: 350n, scale: 2 },
    });
  });

  it("normalizes short and long decimal spellings to the same units", () => {
    // covers: AC-2, equivalent representations must produce equal units.
    expect(parseMoneyToUnits("12.3", "USD")).toEqual(
      parseMoneyToUnits("12.30", "USD"),
    );
    expect(parseMoneyToUnits("12.", "USD")).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });

  it("rejects excess precision instead of rounding", () => {
    expect(parseMoneyToUnits("1.005", "USD").ok).toBe(false);
    expect(parseMoneyToUnits("0.001", "USD")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
    // JPY has scale zero: any fractional part fails.
    expect(parseMoneyToUnits("100.5", "JPY")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
  });

  it("rejects unknown and unofficial currency codes", () => {
    expect(parseMoneyToUnits("1.00", "XXX")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
    expect(parseMoneyToUnits("1.00", "usd")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
    expect(parseMoneyToUnits("1.00", "")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
  });

  it("rejects non decimal input", () => {
    for (const value of [
      "abc",
      "1.2.3",
      "1,00",
      "NaN",
      "Infinity",
      "1e5",
      " 1.00",
      "1.00 ",
      "",
      "--1.00",
    ]) {
      expect(parseMoneyToUnits(value, "USD")).toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
      });
    }
  });

  it("accepts and rejects values at the bigint storage bounds", () => {
    const max = "92233720368547758.07";
    const min = "-92233720368547758.08";
    expect(parseMoneyToUnits(max, "USD")).toEqual({
      ok: true,
      value: { units: 9223372036854775807n, scale: 2 },
    });
    expect(parseMoneyToUnits(min, "USD")).toEqual({
      ok: true,
      value: { units: -9223372036854775808n, scale: 2 },
    });
    expect(parseMoneyToUnits("92233720368547758.08", "USD")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
    expect(parseMoneyToUnits("-92233720368547758.09", "USD")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_MONEY",
    });
  });

  it("uses the registry scale for non USD currencies", () => {
    expect(parseMoneyToUnits("1.234", "BHD")).toEqual({
      ok: true,
      value: { units: 1234n, scale: 3 },
    });
    expect(parseMoneyToUnits("1500", "JPY")).toEqual({
      ok: true,
      value: { units: 1500n, scale: 0 },
    });
    expect(parseMoneyToUnits("1.2345", "CLF")).toEqual({
      ok: true,
      value: { units: 12345n, scale: 4 },
    });
  });

  it("normalizes negative zero to zero units", () => {
    // covers: AC-2, digest canonicalization requires -0 to become 0.
    expect(parseMoneyToUnits("-0.00", "USD")).toEqual({
      ok: true,
      value: { units: 0n, scale: 2 },
    });
  });
});

describe("currencyScale and unitsInRange", () => {
  it("exposes a recorded registry edition", () => {
    expect(typeof CURRENCY_SCALE_REGISTRY_EDITION).toBe("string");
    expect(CURRENCY_SCALE_REGISTRY_EDITION.length).toBeGreaterThan(0);
  });

  it("reports scales and bounds", () => {
    expect(currencyScale("USD")).toBe(2);
    expect(currencyScale("JPY")).toBe(0);
    expect(currencyScale("NOPE")).toBeNull();
    expect(unitsInRange(9223372036854775807n)).toBe(true);
    expect(unitsInRange(9223372036854775808n)).toBe(false);
    expect(unitsInRange(-9223372036854775808n)).toBe(true);
    expect(unitsInRange(-9223372036854775809n)).toBe(false);
  });
});
