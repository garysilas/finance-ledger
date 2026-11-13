import { describe, expect, it } from "vitest";

import {
  CLASSIFICATIONS,
  classificationMatchesAmount,
  fallbackClassification,
  SEED_CATEGORIES,
  UNCATEGORIZED_STABLE_KEY,
} from "./classification";

// covers: AC-4 (sign rules and safe fallbacks for effective values)
describe("classificationMatchesAmount", () => {
  it("requires nonnegative amounts for spending", () => {
    expect(classificationMatchesAmount("spending", 0n)).toBe(true);
    expect(classificationMatchesAmount("spending", 500n)).toBe(true);
    expect(classificationMatchesAmount("spending", -1n)).toBe(false);
  });

  it("requires nonpositive amounts for refund and income", () => {
    for (const classification of ["refund", "income"] as const) {
      expect(classificationMatchesAmount(classification, 0n)).toBe(true);
      expect(classificationMatchesAmount(classification, -500n)).toBe(true);
      expect(classificationMatchesAmount(classification, 1n)).toBe(false);
    }
  });

  it("allows either sign for transfer, card payment, and unclassified", () => {
    for (const classification of [
      "transfer",
      "card_payment",
      "unclassified",
    ] as const) {
      expect(classificationMatchesAmount(classification, -100n)).toBe(true);
      expect(classificationMatchesAmount(classification, 0n)).toBe(true);
      expect(classificationMatchesAmount(classification, 100n)).toBe(true);
    }
  });
});

describe("fallbackClassification", () => {
  it("counts unknown outflows as spending and inflows as unclassified", () => {
    expect(fallbackClassification(1n)).toBe("spending");
    expect(fallbackClassification(0n)).toBe("spending");
    expect(fallbackClassification(-1n)).toBe("unclassified");
  });
});

describe("seed categories", () => {
  it("includes the spec stable keys with Uncategorized present", () => {
    const keys = SEED_CATEGORIES.map((category) => category.stableKey);
    expect(keys).toContain(UNCATEGORIZED_STABLE_KEY);
    expect(keys).toContain("groceries");
    expect(keys).toContain("personal_care");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every classification value in the enum", () => {
    expect(CLASSIFICATIONS).toEqual([
      "spending",
      "refund",
      "income",
      "transfer",
      "card_payment",
      "unclassified",
    ]);
  });
});
