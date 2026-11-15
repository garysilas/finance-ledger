import type { Classification } from "./classification";

// Checked in mapping from Plaid personal_finance_category codes to the
// seeded stable category keys and the spec 0003 classifications. Every
// Plaid primary value is enumerated; anything unrecognized falls through
// to null so the foundation fallbacks apply (unknown outflow counts as
// spending under Uncategorized, unknown inflow stays unclassified).
//
// Sign convention: Plaid and spec 0003 share positive = outflow. A
// negative amount in a spending primary classifies as a refund.

export type PlaidCategoryMapping = {
  stableKey: string | null;
  classification: Classification | null;
};

const SPENDING_PRIMARY_KEYS: Readonly<Record<string, string>> = {
  BANK_FEES: "fees",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "dining",
  GENERAL_MERCHANDISE: "shopping",
  GENERAL_SERVICES: "other",
  GOVERNMENT_AND_NON_PROFIT: "other",
  HOME_IMPROVEMENT: "housing",
  MEDICAL: "health",
  PERSONAL_CARE: "personal_care",
  RENT_AND_UTILITIES: "housing",
  TRANSPORTATION: "transport",
  TRAVEL: "travel",
};

// Detailed codes that override their primary's stable key. Keys are the
// stable category keys; the classification still derives from the primary.
const DETAILED_KEY_OVERRIDES: Readonly<Record<string, string>> = {
  FOOD_AND_DRINK_GROCERIES: "groceries",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "utilities",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "utilities",
  RENT_AND_UTILITIES_TELEPHONE: "utilities",
  RENT_AND_UTILITIES_WATER: "utilities",
};

function isCardPayment(detailed: string | null): boolean {
  return detailed !== null && detailed.includes("CREDIT_CARD");
}

// Map one Plaid category pair plus the transaction sign to the ledger
// stable key and classification. Null values let the batch service apply
// the spec 0003 fallbacks.
export function mapPlaidCategory(
  primary: string | null,
  detailed: string | null,
  amountUnits: bigint,
): PlaidCategoryMapping {
  if (primary === null) {
    return { stableKey: null, classification: null };
  }

  if (primary === "INCOME") {
    return { stableKey: null, classification: "income" };
  }
  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") {
    return {
      stableKey: null,
      classification: isCardPayment(detailed) ? "card_payment" : "transfer",
    };
  }
  if (primary === "LOAN_PAYMENTS") {
    return {
      stableKey: null,
      classification: isCardPayment(detailed) ? "card_payment" : "transfer",
    };
  }

  const spendingKey = SPENDING_PRIMARY_KEYS[primary];
  if (spendingKey === undefined) {
    // OTHER and any future primary fall back to spec 0003 handling.
    return { stableKey: null, classification: null };
  }

  const override =
    detailed === null ? undefined : DETAILED_KEY_OVERRIDES[detailed];
  return {
    stableKey: override ?? spendingKey,
    classification: amountUnits >= 0n ? "spending" : "refund",
  };
}
