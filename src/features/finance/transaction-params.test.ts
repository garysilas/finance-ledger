import { describe, expect, it } from "vitest";

import {
  SEARCH_MAX_LENGTH,
  decodeCursor,
  encodeCursor,
  escapeLike,
  hasActiveFilter,
  normalizeSearch,
  parseTransactionFilters,
  spendingHref,
} from "./transaction-params";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

// covers spec 0007 AC-3: URL filters, the Uncategorized sentinel, search
// normalization and escaping, and a cursor that never enters the URL.
describe("normalizeSearch", () => {
  it("trims and treats blank text as no search", () => {
    expect(normalizeSearch("  cafe  ")).toBe("cafe");
    expect(normalizeSearch("   ")).toBeNull();
    expect(normalizeSearch(undefined)).toBeNull();
    expect(normalizeSearch(null)).toBeNull();
  });

  it("caps the search at 120 characters", () => {
    expect(normalizeSearch("a".repeat(200))).toHaveLength(SEARCH_MAX_LENGTH);
  });
});

describe("escapeLike", () => {
  it("escapes percent, underscore, and backslash", () => {
    expect(escapeLike("100%_off\\now")).toBe("100\\%\\_off\\\\now");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("parseTransactionFilters", () => {
  it("reads category, account, search, and the excluded toggle", () => {
    expect(
      parseTransactionFilters({
        category: ID.toUpperCase(),
        account: ID,
        q: " lunch ",
        excluded: "1",
      }),
    ).toEqual({
      filters: { category: ID, account: ID, q: "lunch", showExcluded: true },
      normalized: false,
    });
  });

  it("accepts the uncategorized sentinel and takes the first repeated value", () => {
    const { filters } = parseTransactionFilters({
      category: ["uncategorized", ID],
    });
    expect(filters.category).toBe("uncategorized");
  });

  it("drops malformed ids with a normalization flag", () => {
    expect(
      parseTransactionFilters({ category: "dining", account: "1" }),
    ).toEqual({
      filters: { category: null, account: null, q: null, showExcluded: false },
      normalized: true,
    });
  });

  it("treats anything but excluded=1 as off and empty values as absent", () => {
    expect(
      parseTransactionFilters({ excluded: "true", category: "" }),
    ).toMatchObject({ filters: { showExcluded: false }, normalized: false });
  });
});

describe("hasActiveFilter", () => {
  it("ignores the excluded toggle", () => {
    const none = { category: null, account: null, q: null, showExcluded: true };
    expect(hasActiveFilter(none)).toBe(false);
    expect(hasActiveFilter({ ...none, q: "x" })).toBe(true);
  });
});

describe("spendingHref", () => {
  it("encodes month and set filters only, never a cursor", () => {
    expect(spendingHref("2031-01")).toBe("/spending?month=2031-01");
    expect(
      spendingHref("2031-01", {
        category: "uncategorized",
        account: null,
        q: "a&b",
        showExcluded: true,
      }),
    ).toBe("/spending?month=2031-01&category=uncategorized&q=a%26b&excluded=1");
  });
});

describe("cursor", () => {
  it("round trips the effective date and id", () => {
    const cursor = encodeCursor("2031-01-15", ID);
    expect(decodeCursor(cursor)).toEqual({ date: "2031-01-15", id: ID });
  });

  it("rejects anything else", () => {
    expect(decodeCursor("2031-01-15")).toBeNull();
    expect(decodeCursor(`x_${ID}`)).toBeNull();
  });
});
