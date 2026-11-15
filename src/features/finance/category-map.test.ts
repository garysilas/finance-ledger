import { describe, expect, it } from "vitest";

import { mapPlaidCategory } from "./category-map";

// covers: AC-6 checked in mapping from Plaid personal_finance_category
// codes and amount sign to stable category keys and spec 0003
// classifications. Positive is outflow in both Plaid and spec 0003; the
// refund test pins the sign convention so a flip corrupts every total.
describe("mapPlaidCategory", () => {
  it("classifies a positive spending amount as spending with the primary stable key", () => {
    expect(mapPlaidCategory("FOOD_AND_DRINK", null, 1299n)).toEqual({
      stableKey: "dining",
      classification: "spending",
    });
  });

  it("classifies a negative spending amount as a refund, keeping the stable key", () => {
    // Sign convention: positive = outflow. A negative amount in a
    // spending primary is money back, never negative spending.
    expect(mapPlaidCategory("GENERAL_MERCHANDISE", null, -500n)).toEqual({
      stableKey: "shopping",
      classification: "refund",
    });
  });

  it("treats a zero amount as spending, not refund", () => {
    expect(mapPlaidCategory("TRAVEL", null, 0n).classification).toBe(
      "spending",
    );
  });

  it.each([
    ["BANK_FEES", "fees"],
    ["ENTERTAINMENT", "entertainment"],
    ["FOOD_AND_DRINK", "dining"],
    ["GENERAL_MERCHANDISE", "shopping"],
    ["GENERAL_SERVICES", "other"],
    ["GOVERNMENT_AND_NON_PROFIT", "other"],
    ["HOME_IMPROVEMENT", "housing"],
    ["MEDICAL", "health"],
    ["PERSONAL_CARE", "personal_care"],
    ["RENT_AND_UTILITIES", "housing"],
    ["TRANSPORTATION", "transport"],
    ["TRAVEL", "travel"],
  ])("maps spending primary %s to stable key %s", (primary, stableKey) => {
    const mapped = mapPlaidCategory(primary, null, 100n);
    expect(mapped.stableKey).toBe(stableKey);
    expect(mapped.classification).toBe("spending");
  });

  it.each([
    ["FOOD_AND_DRINK_GROCERIES", "groceries"],
    ["RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "utilities"],
    ["RENT_AND_UTILITIES_INTERNET_AND_CABLE", "utilities"],
    ["RENT_AND_UTILITIES_OTHER_UTILITIES", "utilities"],
    ["RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT", "utilities"],
    ["RENT_AND_UTILITIES_TELEPHONE", "utilities"],
    ["RENT_AND_UTILITIES_WATER", "utilities"],
  ])("lets detailed code %s override the stable key to %s", (detailed, key) => {
    const primary =
      detailed.split("_")[0] === "FOOD"
        ? "FOOD_AND_DRINK"
        : "RENT_AND_UTILITIES";
    const mapped = mapPlaidCategory(primary, detailed, 100n);
    expect(mapped.stableKey).toBe(key);
    expect(mapped.classification).toBe("spending");
  });

  it("keeps the primary stable key for a detailed code with no override", () => {
    const mapped = mapPlaidCategory(
      "FOOD_AND_DRINK",
      "FOOD_AND_DRINK_RESTAURANT",
      100n,
    );
    expect(mapped.stableKey).toBe("dining");
  });

  it("classifies INCOME as income with no stable key", () => {
    expect(mapPlaidCategory("INCOME", "INCOME_WAGES", -500000n)).toEqual({
      stableKey: null,
      classification: "income",
    });
  });

  it.each(["TRANSFER_IN", "TRANSFER_OUT"])(
    "classifies %s as transfer, never spending",
    (primary) => {
      expect(mapPlaidCategory(primary, null, 2500n)).toEqual({
        stableKey: null,
        classification: "transfer",
      });
    },
  );

  it.each([
    ["TRANSFER_OUT", "TRANSFER_OUT_CREDIT_CARD_PAYMENT"],
    ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"],
  ])(
    "classifies %s with detailed %s as a card payment",
    (primary, detailed) => {
      expect(mapPlaidCategory(primary, detailed, 2500n)).toEqual({
        stableKey: null,
        classification: "card_payment",
      });
    },
  );

  it("classifies LOAN_PAYMENTS without a credit card detailed code as transfer", () => {
    expect(
      mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE", 100000n),
    ).toEqual({ stableKey: null, classification: "transfer" });
  });

  it("passes a null primary through unmapped so batch fallbacks apply", () => {
    expect(mapPlaidCategory(null, null, 100n)).toEqual({
      stableKey: null,
      classification: null,
    });
  });

  it.each(["OTHER", "SOME_FUTURE_PRIMARY"])(
    "passes unrecognized primary %s through unmapped",
    (primary) => {
      expect(mapPlaidCategory(primary, "ANYTHING", 100n)).toEqual({
        stableKey: null,
        classification: null,
      });
    },
  );
});
