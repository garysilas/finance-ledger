export const CLASSIFICATIONS = [
  "spending",
  "refund",
  "income",
  "transfer",
  "card_payment",
  "unclassified",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

export type FieldIntent = "untouched" | "override" | "reset" | "inherited";

// Sign rules: spending requires a nonnegative amount (outflow), refund
// and income require a nonpositive amount (inflow); transfer, card
// payment, and unclassified accept either sign. Zero is allowed for all.
export function classificationMatchesAmount(
  classification: Classification,
  amountUnits: bigint,
): boolean {
  switch (classification) {
    case "spending":
      return amountUnits >= 0n;
    case "refund":
    case "income":
      return amountUnits <= 0n;
    case "transfer":
    case "card_payment":
    case "unclassified":
      return true;
  }
}

// Fallbacks when the provider supplies no usable classification or
// category. Positive outflows count as spending; negative inflows stay
// unclassified and never reduce spending.
export function fallbackClassification(amountUnits: bigint): Classification {
  return amountUnits >= 0n ? "spending" : "unclassified";
}

export type EffectiveValues = {
  classification: Classification;
  categoryStableKey: string | null;
};

export const UNCATEGORIZED_STABLE_KEY = "uncategorized";

export const SEED_CATEGORIES: ReadonlyArray<{
  stableKey: string;
  label: string;
}> = [
  { stableKey: "housing", label: "Housing" },
  { stableKey: "utilities", label: "Utilities" },
  { stableKey: "groceries", label: "Groceries" },
  { stableKey: "dining", label: "Dining" },
  { stableKey: "transport", label: "Transport" },
  { stableKey: "health", label: "Health" },
  { stableKey: "shopping", label: "Shopping" },
  { stableKey: "entertainment", label: "Entertainment" },
  { stableKey: "travel", label: "Travel" },
  { stableKey: "personal_care", label: "Personal care" },
  { stableKey: "fees", label: "Fees" },
  { stableKey: "other", label: "Other" },
  { stableKey: "uncategorized", label: "Uncategorized" },
];
